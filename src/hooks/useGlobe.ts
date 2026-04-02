import { useRef, useCallback, useState, useEffect, useContext } from 'react';
import * as THREE from 'three';
import { GlobeRenderer, type GlobeThemeConfig } from '../globe/GlobeRenderer';
import { ThemeContext, type AquaticTheme } from '../themes';
// GeoLabels removed — no map labels
import { addStep, completeStep } from '../utils/loadProgress';
import type { Species } from './useSpeciesData';
import type { MigrationRoute } from '../data/migrations';
import type { UnderwaterFishData } from '../globe/UnderwaterScene';

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

addStep('scene', 3, '正在初始化3D场景');

// ---------------------------------------------------------------------------
// Globe skin catalogue — different earth textures the user can swap between.
// ---------------------------------------------------------------------------

const GLOBE_SKINS: Record<string, { label: string; texture: string }> = {
  default: {
    label: '蓝色大理石',
    texture: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  },
  dark: { label: '夜景地球', texture: '/textures/earth-dark.jpg' },
  topo: { label: '地形', texture: '/textures/earth-topology.jpg' },
  hd: { label: '高清卫星', texture: '/textures/earth-blue-marble-8k.jpg' },
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
  const [sceneReady, setSceneReady] = useState(false);
  const [globeSkin, setGlobeSkin] = useState<string>('default');
  // Labels removed
  const [isUnderwater, setIsUnderwater] = useState(false);
  const atlasTextureRef = useRef<THREE.Texture | null>(null);
  const spriteManifestRef = useRef<{ sprites: Record<string, { x: number; y: number; w: number; h: number }>; sheetWidth: number; sheetHeight: number } | null>(null);
  const facingDataRef = useRef<Record<string, string> | null>(null);

  // Load sprite facing directions
  useEffect(() => {
    fetch('/data/sprites/facing.json')
      .then((r) => r.json())
      .then((data) => { facingDataRef.current = data; })
      .catch(() => { /* facing data optional */ });
  }, []);

  // -------------------------------------------------------------------------
  // containerRef — create renderer + mount into the DOM element
  // -------------------------------------------------------------------------

  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      // Create renderer lazily on first mount (avoids StrictMode double-create)
      if (!rendererRef.current) {
        rendererRef.current = new GlobeRenderer();
      }
      rendererRef.current.mount(el);

      // Apply initial theme
      rendererRef.current.setTheme(toGlobeThemeConfig(theme.globeTheme));

      setSceneReady(true);
      completeStep('scene');
    },
    [],
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
  // -------------------------------------------------------------------------
  // Build species sprites — called when data + scene are ready
  // -------------------------------------------------------------------------

  const builtRef = useRef(false);
  const buildSprites = useCallback(
    async (species: Species[], migrationRoutes?: MigrationRoute[]) => {
      const renderer = rendererRef.current;
      if (!renderer || builtRef.current) return;
      builtRef.current = true;

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
                tex.generateMipmaps = true;
                tex.minFilter = THREE.LinearMipmapLinearFilter; // smooth when small
                tex.magFilter = THREE.LinearFilter;
                tex.anisotropy = 4; // sharper at angles
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

        // Store references for underwater scene
        atlasTextureRef.current = atlasTexture;
        spriteManifestRef.current = {
          sprites: manifest.sprites,
          sheetWidth: sheet.width,
          sheetHeight: sheet.height,
        };

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
      renderer.flyTo(lat, lng, options.zoomDistance, options.duration);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Underwater dive — enter/exit immersive underwater view
  // -------------------------------------------------------------------------

  // Register underwater change callback when renderer is ready
  useEffect(() => {
    if (!rendererRef.current || !sceneReady) return;
    rendererRef.current.onUnderwaterChange((uw) => setIsUnderwater(uw));
  }, [sceneReady]);

  const enterUnderwater = useCallback(
    (lat: number, lng: number, nearbySpecies: Species[]) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const manifest = spriteManifestRef.current;
      const atlas = atlasTextureRef.current;

      // Prepare fish data for the underwater scene
      const fishData: UnderwaterFishData[] = [];
      if (manifest) {
        for (const sp of nearbySpecies) {
          const spriteName = sp.sprite.replace('.png', '');
          const rect = manifest.sprites[spriteName];
          if (!rect) continue;
          const facingKey = spriteName.replace(/^sp-/, '');
          const facingDir = facingDataRef.current?.[facingKey] ?? 'right';
          fishData.push({
            species: sp,
            uvRect: rect,
            sheetWidth: manifest.sheetWidth,
            sheetHeight: manifest.sheetHeight,
            facingLeft: facingDir === 'left',
          });
        }
      }

      // Dive immediately — the clicked point is already visible, no flyTo needed
      renderer.enterUnderwater(lat, lng, atlas, fishData);
    },
    [],
  );

  const exitUnderwater = useCallback(() => {
    rendererRef.current?.exitUnderwater();
  }, []);

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      // No labels to dispose
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
    buildSprites,
    flyTo,
    isUnderwater,
    enterUnderwater,
    exitUnderwater,
  };
}
