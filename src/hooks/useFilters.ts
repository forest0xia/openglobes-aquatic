import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSpatialIndex } from '@openglobes/core';
import type { PointItem } from '@openglobes/core';

export function useFilters(
  setUpdateCamera: (fn: (distance: number, bounds: { north: number; south: number; east: number; west: number }) => void) => void,
  syncSpriteLayers?: (points: PointItem[]) => void,
) {
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [activeMonth, setActiveMonth] = useState<number | null>(null);

  const spatial = useSpatialIndex({
    tileBaseUrl: '/data',
    tileManifestUrl: '/tile-manifest.json',
    minZoom: 0,
    maxZoom: 6,
    filters: filterValues,
  });

  // Wire up camera updates to spatial index
  useEffect(() => {
    setUpdateCamera(spatial.updateCamera);
  }, [spatial.updateCamera, setUpdateCamera]);

  const handleFilterChange = useCallback((key: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Convert clusters to renderable pseudo-points
  const clusterPoints = useMemo((): PointItem[] => {
    if (spatial.clusters.length === 0) return [];
    return spatial.clusters.map((c, i) => ({
      id: `cluster-${i}`,
      lat: c.lat,
      lng: c.lng,
      name: `${c.count.toLocaleString()} species`,
      rarity: 0,
      _isCluster: true,
      _count: c.count,
      _topItems: c.topItems,
      groupDistribution: (c as unknown as Record<string, unknown>).groupDistribution,
    } as PointItem));
  }, [spatial.clusters]);

  // Client-side filtering (waterType + bodyGroup)
  const filteredPoints = useMemo(() => {
    return spatial.points.filter((p) => {
      const pAny = p as Record<string, unknown>;
      const wt = filterValues.waterType;
      if (Array.isArray(wt) && wt.length > 0) {
        if (!wt.includes(pAny.waterType)) return false;
      }
      const bg = filterValues.bodyGroup;
      if (Array.isArray(bg) && bg.length > 0) {
        if (!bg.includes(pAny.bodyGroup ?? pAny.group)) return false;
      }
      return true;
    });
  }, [spatial.points, filterValues.waterType, filterValues.bodyGroup]);

  // Persistent points ref for Discover / NearMe
  const allPointsRef = useRef<PointItem[]>([]);
  useEffect(() => {
    if (spatial.points.length > 0) {
      allPointsRef.current = spatial.points;
    }
  }, [spatial.points]);

  // Keep last non-empty points to avoid blank screen during zoom transitions
  const lastPointsRef = useRef<PointItem[]>([]);
  const useClusterView = clusterPoints.length > 0 && spatial.zoom <= 5;
  const rawDisplayPoints = useClusterView ? clusterPoints : filteredPoints;

  if (rawDisplayPoints.length > 0) {
    lastPointsRef.current = rawDisplayPoints;
  }
  const displayPoints = rawDisplayPoints.length > 0 ? rawDisplayPoints : lastPointsRef.current;

  // Sync sprite layers whenever display points change
  useEffect(() => {
    syncSpriteLayers?.(displayPoints);
  }, [displayPoints, syncSpriteLayers]);

  // Aggregate species count
  const totalSpeciesCount = useMemo(() => {
    if (spatial.clusters.length > 0) {
      return spatial.clusters.reduce((sum, c) => sum + c.count, 0);
    }
    return filteredPoints.length;
  }, [spatial.isClusterZoom, spatial.clusters, filteredPoints]);

  return {
    filterValues,
    handleFilterChange,
    activeMonth,
    setActiveMonth,
    spatial,
    displayPoints,
    allPointsRef,
    totalSpeciesCount,
  };
}
