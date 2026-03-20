import type { GlobeTheme, PointItem } from '@openglobes/core';

// Design system rarity colors
const RARITY_COLORS: Record<number, string> = {
  0: '#48bfe6', // Common — cyan
  1: '#56d6a0', // Uncommon — teal-green
  2: '#f9c74f', // Rare — gold
  3: '#ef476f', // Legendary — crimson-pink
  4: '#b185db', // Mythic — purple
};

const RARITY_SIZES: Record<number, number> = {
  0: 0.12,
  1: 0.16,
  2: 0.22,
  3: 0.3,
  4: 0.35,
};

export const fishTheme: GlobeTheme = {
  id: 'fish',
  name: 'FishGlobe',
  tagline: '35,000+ fish species worldwide',

  globeTexture: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  atmosphereColor: '#4cc9f0',
  backgroundColor: '#050a12',

  pointColor: (item: PointItem) => {
    if ((item as Record<string, unknown>)._isCluster) {
      const count = (item as Record<string, unknown>)._count as number;
      if (count > 500) return '#ef476f';
      if (count > 100) return '#f9c74f';
      if (count > 20) return '#56d6a0';
      return '#48bfe6';
    }
    return RARITY_COLORS[item.rarity as number] ?? '#48bfe6';
  },
  pointSize: (item: PointItem) => {
    if ((item as Record<string, unknown>)._isCluster) {
      const count = (item as Record<string, unknown>)._count as number;
      return Math.min(3, 0.5 + Math.log10(count + 1) * 0.5);
    }
    return RARITY_SIZES[item.rarity as number] ?? 0.12;
  },
  clusterColor: (count: number) => {
    if (count > 500) return '#ef476f';
    if (count > 100) return '#f9c74f';
    if (count > 20) return '#56d6a0';
    return '#48bfe6';
  },

  colors: {
    primary: '#4cc9f0',
    surface: 'rgba(8, 16, 32, 0.72)',
    text: 'rgba(230, 240, 255, 0.95)',
    textMuted: 'rgba(160, 180, 210, 0.72)',
    accent: '#4cc9f0',
    gradient: ['#050a12', '#0d1930'] as [string, string],
  },

  fonts: {
    display: '"Outfit", sans-serif',
    body: '"DM Sans", sans-serif',
    mono: '"JetBrains Mono", monospace',
  },

  filters: [
    {
      key: 'waterType',
      label: 'Water Type',
      type: 'chips',
      options: ['Brackish', 'Freshwater', 'Saltwater'],
    },
    {
      key: 'depth',
      label: 'Depth',
      type: 'range',
      min: 0,
      max: 8370,
      unit: 'm',
    },
    {
      key: 'rarity',
      label: 'Rarity',
      type: 'chips',
      options: ['Common', 'Uncommon', 'Rare', 'Legendary'],
    },
  ],

  detailFields: [
    { key: 'scientificName', label: 'Scientific Name' },
    { key: 'metadata.habitat', label: 'Habitat' },
    { key: 'metadata.depth', label: 'Depth' },
    { key: 'metadata.maxLength', label: 'Max Length' },
    { key: 'metadata.maxWeight', label: 'Max Weight' },
    { key: 'metadata.diet', label: 'Diet' },
    { key: 'metadata.rarity', label: 'Rarity' },
  ],

  attribution: [
    { name: 'FishBase', url: 'https://www.fishbase.se', license: 'CC-BY-NC 4.0' },
    { name: 'GBIF', url: 'https://www.gbif.org', license: 'CC0/CC-BY 4.0' },
  ],

  externalLinks: (item: PointItem) => [
    { label: 'FishBase', url: `https://www.fishbase.se/summary/${item.id}` },
  ],
};
