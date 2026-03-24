import { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react';
import type { PointItem, GlobeSceneRefs } from '@openglobes/core';
import { ThemeContext } from '../themes';
import { GeoLabelsManager } from '../components/GeoLabels';
import { GEO_LABELS } from '../data/geoLabels';
import { SpritePointLayer } from '../sprites/SpritePointLayer';
import { ClusterSwarmLayer } from '../sprites/ClusterSwarmLayer';
import { flyTo } from '../utils/flyTo';

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

  // Sprite layers
  const spritePointLayerRef = useRef<SpritePointLayer | null>(null);
  const clusterSwarmLayerRef = useRef<ClusterSwarmLayer | null>(null);

  const handleSceneReady = useCallback((refs: GlobeSceneRefs) => {
    sceneRefsRef.current = refs;
    labelsManagerRef.current = new GeoLabelsManager(refs.scene, refs.getCoords, GEO_LABELS);
    spritePointLayerRef.current = new SpritePointLayer(refs.scene, refs.getCoords);
    clusterSwarmLayerRef.current = new ClusterSwarmLayer(refs.scene, refs.getCoords);
  }, []);

  const frameCount = useRef(0);
  const handleFrame = useCallback((dt: number) => {
    frameCount.current++;
    if (sceneRefsRef.current) {
      // Sprite animation + culling every frame
      spritePointLayerRef.current?.update(sceneRefsRef.current.camera, dt);
      clusterSwarmLayerRef.current?.update(sceneRefsRef.current.camera);

      // Label culling every 10 frames
      if (frameCount.current % 10 === 0) {
        labelsManagerRef.current?.update(sceneRefsRef.current.camera);
      }
    }
  }, []);

  // Sync sprite layers when display points change
  const syncSpriteLayers = useCallback((displayPoints: PointItem[]) => {
    spritePointLayerRef.current?.syncPoints(displayPoints);
    clusterSwarmLayerRef.current?.syncClusters(displayPoints);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      labelsManagerRef.current?.dispose();
      labelsManagerRef.current = null;
      spritePointLayerRef.current?.dispose();
      spritePointLayerRef.current = null;
      clusterSwarmLayerRef.current?.dispose();
      clusterSwarmLayerRef.current = null;
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
      Math.abs(distance - prev.dist) > 0.5 ||
      Math.abs(centerLat - prev.lat) > 0.3 ||
      Math.abs(centerLng - prev.lng) > 0.3;

    if (moved) {
      lastCamRef.current = { dist: distance, lat: centerLat, lng: centerLng };
      updateCameraRef.current?.(distance, bounds);
    }

    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      updateCameraRef.current?.(distance, bounds);
    }, 250);
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
