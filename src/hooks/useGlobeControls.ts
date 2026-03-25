import { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react';
import type { PointItem, GlobeSceneRefs } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { GeoLabelsManager } from '../components/GeoLabels';
import { GEO_LABELS } from '../data/geoLabels';
import { SpritePointLayer } from '../sprites/SpritePointLayer';
import { flyTo } from '../utils/flyTo';
import { addStep, completeStep } from '../utils/loadProgress';

// Register the scene-ready loading step once at module level
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

  // Scene refs
  const sceneRefsRef = useRef<GlobeSceneRefs | null>(null);
  const labelsManagerRef = useRef<GeoLabelsManager | null>(null);

  // Sprite layer (handles both individual points and clusters)
  const spritePointLayerRef = useRef<SpritePointLayer | null>(null);

  const handleSceneReady = useCallback((refs: GlobeSceneRefs) => {
    sceneRefsRef.current = refs;
    // Disable auto-rotation — globe stays still until user interacts
    refs.controls.autoRotate = false;
    labelsManagerRef.current = new GeoLabelsManager(refs.scene, refs.getCoords, GEO_LABELS);
    spritePointLayerRef.current = new SpritePointLayer(refs.scene, refs.getCoords);
    completeStep('scene');
  }, []);

  const frameCount = useRef(0);
  const handleFrame = useCallback((dt: number) => {
    frameCount.current++;
    if (sceneRefsRef.current) {
      const cam = sceneRefsRef.current.camera;
      // Sprite animation + back-face culling every frame (no pool reassignment)
      spritePointLayerRef.current?.update(cam, dt);

      // Label culling every 10 frames
      if (frameCount.current % 10 === 0) {
        labelsManagerRef.current?.update(cam);
      }
    }
  }, []);

  // Sync sprite layer when display points change (data-driven only, not on rotation)
  const syncSpriteLayers = useCallback((displayPoints: PointItem[]) => {
    const cam = sceneRefsRef.current?.camera;
    if (cam) spritePointLayerRef.current?.syncPoints(displayPoints, cam);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      labelsManagerRef.current?.dispose();
      labelsManagerRef.current = null;
      spritePointLayerRef.current?.dispose();
      spritePointLayerRef.current = null;
    };
  }, []);

  // Sync label visibility
  useEffect(() => {
    if (!labelsManagerRef.current) return;
    labelsManagerRef.current.setVisible(labelTypes.length > 0);
    for (const type of ['ocean', 'sea', 'continent', 'island']) {
      labelsManagerRef.current.setTypeVisible(type, labelTypes.includes(type));
    }
  }, [labelTypes]);

  // Camera throttle for spatial index
  const updateCameraRef = useRef<((distance: number, bounds: { north: number; south: number; east: number; west: number }) => void) | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCamRef = useRef({ dist: 0, lat: 0, lng: 0 });

  const setUpdateCamera = useCallback(
    (fn: (distance: number, bounds: { north: number; south: number; east: number; west: number }) => void) => {
      updateCameraRef.current = fn;
    },
    [],
  );

  const handleCameraChange = useCallback((distance: number) => {
    const cam = sceneRefsRef.current?.camera;
    let centerLat = 0;
    let centerLng = 0;
    if (cam) {
      const { x, y, z } = cam.position;
      const r = Math.sqrt(x * x + y * y + z * z);
      centerLat = Math.asin(y / r) * (180 / Math.PI);
      centerLng = Math.atan2(x, z) * (180 / Math.PI);
    }

    const halfArc = Math.asin(Math.min(1, 100 / distance)) * (180 / Math.PI);
    const bounds = {
      north: Math.min(85, centerLat + halfArc),
      south: Math.max(-85, centerLat - halfArc),
      east: Math.min(180, centerLng + halfArc),
      west: Math.max(-180, centerLng - halfArc),
    };

    const prev = lastCamRef.current;
    const moved =
      prev.dist === 0 ||
      Math.abs(distance - prev.dist) > 1.0 ||
      Math.abs(centerLat - prev.lat) > 1.0 ||
      Math.abs(centerLng - prev.lng) > 1.0;

    if (moved) {
      lastCamRef.current = { dist: distance, lat: centerLat, lng: centerLng };
      updateCameraRef.current?.(distance, bounds);
      // Clear any pending trailing update — the immediate call covers it
      if (throttleRef.current) clearTimeout(throttleRef.current);
      throttleRef.current = null;
    } else {
      // Below threshold — schedule a trailing update so we catch the final
      // resting position after a smooth pan/zoom ends
      if (throttleRef.current) clearTimeout(throttleRef.current);
      throttleRef.current = setTimeout(() => {
        lastCamRef.current = { dist: distance, lat: centerLat, lng: centerLng };
        updateCameraRef.current?.(distance, bounds);
        throttleRef.current = null;
      }, 250);
    }
  }, []);

  const handleFlyTo = useCallback((lat: number, lng: number) => {
    if (sceneRefsRef.current) flyTo(sceneRefsRef.current, lat, lng);
  }, []);

  // Theme for Globe component (strip non-core filters, apply skin)
  const coreTheme = useMemo(() => {
    const coreFilters = theme.globeTheme.filters.filter(
      (f) => f.key !== 'rarity' && f.key !== 'depth',
    );
    const skinTexture = GLOBE_SKINS[globeSkin]?.texture ?? theme.globeTheme.globeTexture;
    return { ...theme.globeTheme, filters: coreFilters, globeTexture: skinTexture };
  }, [theme.globeTheme, globeSkin]);

  return {
    theme,
    setThemeId,
    isNightMode,
    globeSkin,
    setGlobeSkin,
    GLOBE_SKINS,
    labelTypes,
    setLabelTypes,
    sceneRefsRef,
    handleSceneReady,
    handleFrame,
    handleCameraChange,
    handleFlyTo,
    setUpdateCamera,
    coreTheme,
    syncSpriteLayers,
  };
}
