import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GlobeSceneRefs } from '@openglobes/core';
import {
  loadMigrationRoutes,
  getMigrationRoutes,
  getMigrationTrails,
  type MigrationRoute,
} from '../data/migrations';
import { OCEAN_CURRENTS, CURRENTS_DEFAULT_VISIBLE } from '../data/currents';
import { flyTo } from '../utils/flyTo';

export function useMigrationRoutes(sceneRefsRef: React.RefObject<GlobeSceneRefs | null>) {
  const [migrationRoutes, setMigrationRoutes] = useState<MigrationRoute[]>([]);
  const [maxMigrationRoutes, setMaxMigrationRoutes] = useState(0); // 0 = all
  const [showMigrations, setShowMigrations] = useState(true);
  const [showCurrents, setShowCurrents] = useState(CURRENTS_DEFAULT_VISIBLE);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null); // click-selected, triggers trail highlight
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null); // hover-opened detail, no trail re-render
  const [routeTooltip, setRouteTooltip] = useState<{
    x: number;
    y: number;
    route: MigrationRoute;
  } | null>(null);
  const hoverThrottleRef = useRef(0);

  // Load on mount
  useEffect(() => {
    loadMigrationRoutes().then(() => {
      setMigrationRoutes(getMigrationRoutes());
    });
  }, []);

  // Route list items for ListPanel
  const migrationRouteItems = useMemo(
    () =>
      migrationRoutes.map((r) => ({
        id: r.id,
        name: r.name,
        extra: `${r.species} (${r.type})`,
      })),
    [migrationRoutes],
  );

  // Trail data with selected route highlighting
  const migrationTrails = useMemo(() => {
    if (!showMigrations) return [];
    const trails = getMigrationTrails(maxMigrationRoutes);
    if (!selectedRouteId) return trails;
    const selectedRoute = migrationRoutes.find((r) => r.id === selectedRouteId);
    if (!selectedRoute) return trails;
    return trails.map((t) => {
      if (t.label === selectedRoute.name) {
        return { ...t, width: 6, color: ['rgba(255,255,255,0.9)', 'rgba(76,201,240,0.7)'] };
      }
      return t;
    });
  }, [showMigrations, maxMigrationRoutes, migrationRoutes, selectedRouteId]);

  // Combined trails (migrations + currents)
  const memoTrails = useMemo(
    () => [...migrationTrails, ...(showCurrents ? OCEAN_CURRENTS : [])],
    [migrationTrails, showCurrents],
  );

  // Select a route → fly to it
  const handleRouteSelect = useCallback(
    (routeId: string) => {
      const route = migrationRoutes.find((r) => r.id === routeId);
      if (!route || route.waypoints.length === 0) return;

      setSelectedRouteId(routeId);

      const wps = route.waypoints;
      const midLat = (wps[0].lat + wps[wps.length - 1].lat) / 2;
      const midLng = (wps[0].lng + wps[wps.length - 1].lng) / 2;
      const latSpan = Math.abs(wps[0].lat - wps[wps.length - 1].lat);
      const lngSpan = Math.abs(wps[0].lng - wps[wps.length - 1].lng);
      const span = Math.max(latSpan, lngSpan);
      const zoomDist = Math.min(450, Math.max(200, span * 3));

      if (sceneRefsRef.current) {
        flyTo(sceneRefsRef.current, midLat, midLng, { duration: 2000, zoomDistance: zoomDist });
      }
    },
    [migrationRoutes, sceneRefsRef],
  );

  // Arc click → select route
  const handleArcClick = useCallback(
    (label: string) => {
      const route = migrationRoutes.find((r) => r.name === label);
      if (route) {
        setSelectedRouteId(route.id);
      }
    },
    [migrationRoutes],
  );

  // Reusable THREE objects — allocated once, never GC'd
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());

  // Refs for values used in hover handler to avoid dependency churn
  const showMigrationsRef = useRef(showMigrations);
  showMigrationsRef.current = showMigrations;
  const migrationRoutesRef = useRef(migrationRoutes);
  migrationRoutesRef.current = migrationRoutes;

  // Hover tooltip — checks proximity to trail segments
  const handleRouteHover = useCallback(
    (e: React.PointerEvent) => {
      const now = Date.now();
      if (now - hoverThrottleRef.current < 200) return;
      hoverThrottleRef.current = now;

      const routes = migrationRoutesRef.current;
      if (!sceneRefsRef.current || !showMigrationsRef.current || routes.length === 0) {
        setRouteTooltip(null);
        setHoveredRouteId(null);
        return;
      }

      const { camera, globe } = sceneRefsRef.current;
      const container = document.getElementById('og-app');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      ndcRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycasterRef.current.setFromCamera(ndcRef.current, camera);
      const hits = raycasterRef.current.intersectObject(globe, true);
      if (hits.length === 0) {
        setRouteTooltip(null);
        setHoveredRouteId(null);
        return;
      }

      const hp = hits[0].point;
      const r = Math.sqrt(hp.x ** 2 + hp.y ** 2 + hp.z ** 2);
      const hitLat = Math.asin(hp.y / r) * (180 / Math.PI);
      const hitLng = Math.atan2(hp.x, hp.z) * (180 / Math.PI);

      let bestDist = Infinity;
      let bestRoute: MigrationRoute | null = null;
      const camDist = camera.position.length();
      const threshold = Math.min(5, Math.max(1.5, camDist / 80));

      for (const route of routes) {
        const wps = route.waypoints;
        for (let i = 0; i < wps.length; i++) {
          const d0 = Math.sqrt((wps[i].lat - hitLat) ** 2 + (wps[i].lng - hitLng) ** 2);
          if (d0 < bestDist && d0 < threshold) {
            bestDist = d0;
            bestRoute = route;
          }
          if (i < wps.length - 1) {
            const ax = wps[i].lng,
              ay = wps[i].lat;
            const bx = wps[i + 1].lng,
              by = wps[i + 1].lat;
            const dx = bx - ax,
              dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0) {
              const t = Math.max(
                0,
                Math.min(1, ((hitLng - ax) * dx + (hitLat - ay) * dy) / lenSq),
              );
              const projX = ax + t * dx,
                projY = ay + t * dy;
              const dSeg = Math.sqrt((projX - hitLng) ** 2 + (projY - hitLat) ** 2);
              if (dSeg < bestDist && dSeg < threshold) {
                bestDist = dSeg;
                bestRoute = route;
              }
            }
          }
        }
      }

      if (bestRoute) {
        setRouteTooltip({ x: e.clientX, y: e.clientY, route: bestRoute });
        setHoveredRouteId(bestRoute.id);
      } else {
        setRouteTooltip(null);
        setHoveredRouteId(null);
      }
    },
    [sceneRefsRef], // stable ref — no state deps that cause re-creation
  );

  // The route to show in the detail panel: clicked takes priority, then hovered
  const activeRouteId = selectedRouteId ?? hoveredRouteId;
  const selectedRoute = useMemo(
    () => (activeRouteId ? migrationRoutes.find((r) => r.id === activeRouteId) ?? null : null),
    [activeRouteId, migrationRoutes],
  );

  return {
    migrationRoutes,
    migrationRouteItems,
    maxMigrationRoutes,
    setMaxMigrationRoutes,
    showMigrations,
    setShowMigrations,
    showCurrents,
    setShowCurrents,
    selectedRouteId,
    setSelectedRouteId,
    selectedRoute,
    routeTooltip,
    setRouteTooltip,
    memoTrails,
    handleRouteSelect,
    handleArcClick,
    handleRouteHover,
  };
}
