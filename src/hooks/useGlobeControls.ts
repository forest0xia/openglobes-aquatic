import { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react';
import type { GlobeSceneRefs } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { GeoLabelsManager } from '../components/GeoLabels';
import { GEO_LABELS } from '../data/geoLabels';
import { SpritePointLayer } from '../sprites/SpritePointLayer';
import { MigrationSpriteLayer, setSpeciesSpriteMap } from '../sprites/MigrationSpriteLayer';
import type { Species } from './useSpeciesData';
import type { MigrationRoute } from '../data/migrations';
import { flyTo } from '../utils/flyTo';
import { addStep, completeStep } from '../utils/loadProgress';

addStep('scene', 3, 'Initializing 3D scene');

export function useGlobeControls() {
  const { theme, setThemeId } = useContext(ThemeContext);
  const isNightMode = theme.id === 'bioluminescence';

  const [globeSkin, setGlobeSkin] = useState<string>('default');
  const [labelTypes, setLabelTypes] = useState<string[]>(['ocean', 'sea', 'continent', 'island']);

  const GLOBE_SKINS: Record<string, { label: string; texture: string }> = {
    default: { label: 'Blue Marble', texture: theme.globeTheme.globeTexture },
    dark: { label: 'Night Earth', texture: '/textures/earth-dark.jpg' },
    topo: { label: 'Topology', texture: '/textures/earth-topology.jpg' },
    hd: { label: 'HD Satellite', texture: '/textures/earth-blue-marble-8k.jpg' },
  };

  const sceneRefsRef = useRef<GlobeSceneRefs | null>(null);
  const labelsManagerRef = useRef<GeoLabelsManager | null>(null);
  const spriteLayerRef = useRef<SpritePointLayer | null>(null);
  const migrationLayerRef = useRef<MigrationSpriteLayer | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const handleSceneReady = useCallback((refs: GlobeSceneRefs) => {
    sceneRefsRef.current = refs;
    refs.controls.autoRotate = false;
    refs.controls.enableDamping = true;
    refs.controls.dampingFactor = 0.1; // snappier response, less per-frame work

    // Clear unused three-globe data layers to reduce per-frame overhead.
    // Keep the animation running (needed for globe texture/intro tween).
    const globe = refs.globe as any;
    if (typeof globe.pointsData === 'function') globe.pointsData([]);
    if (typeof globe.arcsData === 'function') globe.arcsData([]);
    if (typeof globe.polygonsData === 'function') globe.polygonsData([]);
    if (typeof globe.hexPolygonsData === 'function') globe.hexPolygonsData([]);
    if (typeof globe.labelsData === 'function') globe.labelsData([]);
    if (typeof globe.ringsData === 'function') globe.ringsData([]);
    if (typeof globe.pathsData === 'function') globe.pathsData([]);
    if (typeof globe.tilesData === 'function') globe.tilesData([]);
    if (typeof globe.customLayerData === 'function') globe.customLayerData([]);

    // Pause three-globe's internal animation AFTER the intro completes (2s)
    setTimeout(() => {
      if (typeof globe.pauseAnimation === 'function') {
        globe.pauseAnimation();
      }
    }, 2500);

    labelsManagerRef.current = new GeoLabelsManager(refs.scene, refs.getCoords, GEO_LABELS);
    spriteLayerRef.current = new SpritePointLayer(refs.scene, refs.getCoords);
    migrationLayerRef.current = new MigrationSpriteLayer(refs.scene, refs.getCoords);
    setSceneReady(true);
    completeStep('scene');
  }, []);

  const frameCount = useRef(0);
  const handleFrame = useCallback((dt: number) => {
    if (sceneRefsRef.current) {
      const cam = sceneRefsRef.current.camera;
      spriteLayerRef.current?.update(cam, dt);
      migrationLayerRef.current?.update(cam, dt);

      // Log performance every 300 frames (~5s)
      frameCount.current++;
      if (frameCount.current % 300 === 0) {
        const r = sceneRefsRef.current.renderer;
        const info = r.info;
        console.log(`[perf] frame ${frameCount.current}: geometries=${info.memory.geometries}, textures=${info.memory.textures}, calls=${info.render.calls}, triangles=${info.render.triangles}`);
        info.reset();
      }
    }
  }, []);

  // Build species sprites (called once when data + scene ready)
  const buildSprites = useCallback((species: Species[]) => {
    // Set the species→sprite map for migration routes
    setSpeciesSpriteMap(species);
    spriteLayerRef.current?.build(species);
  }, []);

  // Build migration route sprites (called once when routes load + scene ready)
  const buildMigrationSprites = useCallback((routes: MigrationRoute[]) => {
    migrationLayerRef.current?.build(routes);
  }, []);

  useEffect(() => {
    return () => {
      labelsManagerRef.current?.dispose();
      labelsManagerRef.current = null;
      spriteLayerRef.current?.dispose();
      spriteLayerRef.current = null;
      migrationLayerRef.current?.dispose();
      migrationLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!labelsManagerRef.current) return;
    labelsManagerRef.current.setVisible(labelTypes.length > 0);
    for (const type of ['ocean', 'sea', 'continent', 'island']) {
      labelsManagerRef.current.setTypeVisible(type, labelTypes.includes(type));
    }
  }, [labelTypes]);

  const handleFlyTo = useCallback((lat: number, lng: number) => {
    if (sceneRefsRef.current) flyTo(sceneRefsRef.current, lat, lng);
  }, []);

  // Cast to `any` — this is transitional glue until FishGlobe migrates to
  // the new GlobeRenderer and no longer passes a theme to the core Globe.
  const coreTheme = useMemo(() => {
    const skinTexture = GLOBE_SKINS[globeSkin]?.texture ?? theme.globeTheme.globeTexture;
    return { ...theme.globeTheme, filters: [], globeTexture: skinTexture } as any;
  }, [theme.globeTheme, globeSkin]);

  return {
    theme, setThemeId, isNightMode,
    globeSkin, setGlobeSkin, GLOBE_SKINS,
    labelTypes, setLabelTypes,
    sceneRefsRef, handleSceneReady, handleFrame, handleFlyTo,
    coreTheme, buildSprites, buildMigrationSprites,
    spriteLayerRef, sceneReady,
  };
}
