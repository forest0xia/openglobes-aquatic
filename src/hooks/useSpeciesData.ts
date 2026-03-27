import { useState, useEffect, useRef } from 'react';
import { addStep, completeStep } from '../utils/loadProgress';

// ---------------------------------------------------------------------------
// useSpeciesData — loads final.json + hotspots.json once on mount.
//
// Replaces the old tile-based useFilters hook. All 200 species + 693
// viewing spots fit in ~260KB — no spatial tiling needed.
// ---------------------------------------------------------------------------

export interface ViewingSpot {
  hotspotId?: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  season: string;
  reliability: 'high' | 'medium' | 'seasonal';
  activity: string;
}

export interface SpeciesDisplay {
  color: string;
  animation: 'slow_cruise' | 'schooling' | 'hovering' | 'drifting' | 'darting';
  scale: 'tiny' | 'small' | 'medium' | 'large' | 'massive';
}

export interface Species {
  aphiaId: number;
  tier: 'star' | 'ecosystem' | 'surprise';
  name: string;
  nameZh: string;
  tagline: { en: string; zh: string };
  scientificName: string;
  sprite: string;
  display: SpeciesDisplay;
  viewingSpots: ViewingSpot[];
}

export interface Hotspot {
  id: string;
  name: { en: string; zh: string };
  country: string;
  lat: number;
  lng: number;
  type: string;
  minSpeciesCount: number;
}

addStep('species', 4, '正在加载物种数据');

export function useSpeciesData() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    Promise.all([
      fetch('/data/final.json').then((r) => r.json()) as Promise<Species[]>,
      fetch('/data/hotspots.json').then((r) => r.json()) as Promise<Hotspot[]>,
    ])
      .then(([speciesData, hotspotsData]) => {
        setSpecies(speciesData);
        setHotspots(hotspotsData);
        setLoading(false);
        completeStep('species');
      })
      .catch((err) => {
        console.error('Failed to load species data:', err);
        setLoading(false);
        completeStep('species');
      });
  }, []);

  return { species, hotspots, loading };
}
