import { useRef, useCallback, useState, useEffect, useContext } from 'react';
import * as THREE from 'three';
import { GlobeRenderer, type GlobeThemeConfig } from '../globe/GlobeRenderer';
import { ThemeContext, type AquaticTheme } from '../themes';
import { GeoLabelsManager } from '../components/GeoLabels';
import { GEO_LABELS } from '../data/geoLabels';
import { addStep, completeStep } from '../utils/loadProgress';
import type { Species } from './useSpeciesData';
import type { MigrationRoute } from '../data/migrations';

/** Map an AquaticTheme to GlobeThemeConfig consumed by GlobeRenderer. */
function toGlobeThemeConfig(
  gt: AquaticTheme,
  textureOverride?: string,
): GlobeThemeConfig {
  const globeTexture = textureOverride ?? gt.globeTexture;
  return {
    globeTexture,
    atmosphereColor: gt.atmosphereColor,
    backgroundColor: gt.backgroundColor,
    terrain: gt.terrain
      ? {
          textureUrl: gt.terrain.textureUrl ?? globeTexture,
          bumpUrl: gt.terrain.bumpMap,
          bumpScale: gt.terrain.bumpScale,
          specularUrl: gt.terrain.specularMap,
          specularColor: gt.terrain.specularColor,
          shininess: gt.terrain.shininess,
        }
      : undefined,
  };
}

addStep('scene', 3, 'Initializing 3D scene');

// ---------------------------------------------------------------------------
// Globe skin catalogue — different earth textures the user can swap between.
// ---------------------------------------------------------------------------

const GLOBE_SKINS: Record<string, { label: string; texture: string }> = {
  default: {
    label: 'Blue Marble',
    texture: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  },
  dark: { label: 'Night Earth', texture: '/textures/earth-dark.jpg' },
  topo: { label: 'Topology', texture: '/textures/earth-topology.jpg' },
  hd: { label: 'HD Satellite', texture: '/textures/earth-blue-marble-8k.jpg' },
};

// ---------------------------------------------------------------------------
// Spritesheet manifest type — mirrors the shape produced by the ETL pipeline.
// ---------------------------------------------------------------------------

interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  group?: string;
  bodyType?: string;
}

interface SheetManifest {
  sheets: { png: string; webp: string; width: number; height: number }[];
  sprites: Record<string, SpriteRect>;
}

// ---------------------------------------------------------------------------
// useGlobe — React hook wrapping GlobeRenderer
// ---------------------------------------------------------------------------

export function useGlobe() {
  const { theme, setThemeId } = useContext(ThemeContext);
  const isNightMode = theme.id === 'bioluminescence';

  const rendererRef = useRef<GlobeRenderer | null>(null);
  const labelsManagerRef = useRef<GeoLabelsManager | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [globeSkin, setGlobeSkin] = useState<string>('default');
  const [labelTypes, setLabelTypes] = useState<string[]>([
    'ocean',
    'sea',
    'continent',
    'island',
  ]);

  // Create renderer once (lazy init)
  if (!rendererRef.current) {
    rendererRef.current = new GlobeRenderer();
  }

  // -------------------------------------------------------------------------
  // containerRef — mount the renderer into the DOM element
  // -------------------------------------------------------------------------

  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && rendererRef.current) {
        rendererRef.current.mount(el);

        // Apply initial theme
        rendererRef.current.setTheme(toGlobeThemeConfig(theme.globeTheme));

        // Geo labels
        labelsManagerRef.current = new GeoLabelsManager(
          rendererRef.current['scene'],
          (lat: number, lng: number, alt?: number) =>
            rendererRef.current!.getCoords(lat, lng, alt),
          GEO_LABELS,
        );

        // Per-frame label update (backface culling)
        rendererRef.current.onFrame(() => {
          if (labelsManagerRef.current) {
            labelsManagerRef.current.update(rendererRef.current!.getCamera());
          }
        });

        setSceneReady(true);
        completeStep('scene');
      }
    },
    [], // mount once — theme captured from closure at mount time
  );

  // -------------------------------------------------------------------------
  // Theme changes — re-apply to renderer
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!rendererRef.current || !sceneReady) return;
    const skinTexture =
      GLOBE_SKINS[globeSkin]?.texture ?? theme.globeTheme.globeTexture;
    rendererRef.current.setTheme(
      toGlobeThemeConfig(theme.globeTheme, skinTexture),
    );
  }, [theme, sceneReady, globeSkin]);

  // -------------------------------------------------------------------------
  // Label type visibility
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!labelsManagerRef.current) return;
    labelsManagerRef.current.setVisible(labelTypes.length > 0);
    for (const type of ['ocean', 'sea', 'continent', 'island']) {
      labelsManagerRef.current.setTypeVisible(type, labelTypes.includes(type));
    }
  }, [labelTypes]);

  // -------------------------------------------------------------------------
  // Build species sprites — called when data + scene are ready
  // -------------------------------------------------------------------------

  const buildSprites = useCallback(
    async (species: Species[], migrationRoutes?: MigrationRoute[]) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      try {
        // 1. Fetch the spritesheet manifest
        const resp = await fetch('/data/sprites/spritesheet.json');
        if (!resp.ok) throw new Error('manifest fetch failed');
        const manifest: SheetManifest = await resp.json();

        if (!manifest.sheets || manifest.sheets.length === 0) {
          throw new Error('no sheets in manifest');
        }

        // 2. Determine WebP support
        const useWebP = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.width > 0);
          img.onerror = () => resolve(false);
          img.src =
            'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
        });

        // 3. Load the first sheet image as a THREE.Texture
        const sheet = manifest.sheets[0];
        const sheetUrl = `/data/sprites/${useWebP ? sheet.webp : sheet.png}`;

        const atlasTexture = await new Promise<THREE.Texture>(
          (resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(
              sheetUrl,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                // Spritesheet manifest uses Y=0 at top (image packing convention).
                // Three.js defaults flipY=true which inverts the Y axis.
                // Disable flip so UV coordinates match the manifest.
                tex.flipY = false;
                resolve(tex);
              },
              undefined,
              reject,
            );
          },
        );

        // 4. Build the SpeciesLayer
        renderer.speciesLayer.build(
          species,
          atlasTexture,
          manifest,
          sheet.width,
          sheet.height,
          migrationRoutes,
        );
      } catch (err) {
        console.error('[useGlobe] failed to build species sprites:', err);
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // flyTo — animate camera to a lat/lng
  // -------------------------------------------------------------------------

  const flyTo = useCallback(
    (
      lat: number,
      lng: number,
      options: { duration?: number; zoomDistance?: number } = {},
    ) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const camera = renderer.getCamera();
      const controls = renderer.getControls();
      const duration = options.duration ?? 2000;
      const targetDist =
        options.zoomDistance ?? camera.position.length();

      // Target position on globe surface
      const target = renderer.getCoords(lat, lng, 0);
      const targetVec = new THREE.Vector3(target.x, target.y, target.z);

      // Camera end position: along the vector from origin through target
      const camTarget = targetVec
        .clone()
        .normalize()
        .multiplyScalar(targetDist);

      const startCam = camera.position.clone();
      const startTarget = controls.target.clone();
      const endTarget = new THREE.Vector3(0, 0, 0);

      controls.autoRotate = false;
      const startTime = performance.now();

      function animate() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // ease-in-out cubic
        const ease =
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        camera.position.lerpVectors(startCam, camTarget, ease);
        controls.target.lerpVectors(startTarget, endTarget, ease);
        controls.update();

        if (t < 1) requestAnimationFrame(animate);
      }

      animate();
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      labelsManagerRef.current?.dispose();
      labelsManagerRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return {
    containerRef,
    renderer: rendererRef.current,
    sceneReady,
    theme,
    setThemeId,
    isNightMode,
    globeSkin,
    setGlobeSkin,
    GLOBE_SKINS,
    labelTypes,
    setLabelTypes,
    buildSprites,
    flyTo,
  };
}
