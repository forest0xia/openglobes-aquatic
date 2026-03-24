import type { TrailDatum } from '@openglobes/core';

// ---------------------------------------------------------------------------
// Migration route data — loaded from openglobes-etl/data/raw/fish/migration_routes.json
// at build time via a static import (the file is copied to public/).
// ---------------------------------------------------------------------------

/** A migration route from the JSON data */
export interface MigrationRoute {
  id: string;
  name: string;
  species: string;
  specCode?: number;
  type: string; // anadromous, catadromous, oceanodromous, etc.
  waypoints: { lat: number; lng: number; label?: string }[];
  description: string;
}

// Color by migration type
const TYPE_COLORS: Record<string, string[]> = {
  anadromous:    ['rgba(239, 71, 111, 0.7)', 'rgba(249, 199, 79, 0.5)'],  // salmon-like
  catadromous:   ['rgba(177, 133, 219, 0.7)', 'rgba(76, 201, 240, 0.5)'],  // eel-like
  oceanodromous: ['rgba(76, 201, 240, 0.7)', 'rgba(86, 214, 160, 0.5)'],   // open ocean
  amphidromous:  ['rgba(86, 214, 160, 0.7)', 'rgba(249, 199, 79, 0.5)'],   // freshwater↔sea
  potamodromous: ['rgba(249, 199, 79, 0.7)', 'rgba(239, 71, 111, 0.5)'],   // river-only
};

const DEFAULT_COLOR = ['rgba(76, 201, 240, 0.6)', 'rgba(76, 201, 240, 0.3)'];

let routesData: MigrationRoute[] = [];
let trailsData: TrailDatum[] = [];
let loaded = false;

/** Load migration routes from JSON. Call once on startup. */
export async function loadMigrationRoutes(): Promise<void> {
  if (loaded) return;
  try {
    const resp = await fetch('/data/migration_routes.json');
    if (!resp.ok) return;
    routesData = await resp.json();
    trailsData = routesData.map((r, i) => ({
      id: `mig-${i}`,
      label: r.name,
      color: TYPE_COLORS[r.type] ?? DEFAULT_COLOR,
      width: 3.5,
      dashLength: 0.15,
      dashGap: 0.08,
      altitude: 0.006,
      speed: r.type === 'catadromous' ? 7000 : r.type === 'anadromous' ? 5000 : 4000,
      waypoints: r.waypoints.map(w => ({ lat: w.lat, lng: w.lng })),
    }));
    loaded = true;
  } catch {
    // Silently fail — migration routes are optional
  }
}

/** Get all migration routes (empty until loadMigrationRoutes resolves). */
export function getMigrationRoutes(): MigrationRoute[] {
  return routesData;
}

/** Get trail data for a given number of routes (0 = all). */
export function getMigrationTrails(maxRoutes = 0): TrailDatum[] {
  if (maxRoutes <= 0 || maxRoutes >= trailsData.length) return trailsData;
  return trailsData.slice(0, maxRoutes);
}

/** Get unique migration types for filtering. */
export function getMigrationTypes(): string[] {
  const types = new Set(routesData.map(r => r.type));
  return Array.from(types).sort();
}
