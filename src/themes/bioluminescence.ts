import type { GlobeTheme, PointItem } from '@openglobes/core';

// Larger point sizes — 1.3x the fish theme; deep-sea fish (rarity >= 2) get extra size
const RARITY_SIZES: Record<number, number> = {
  0: 0.156,  // 0.12 * 1.3
  1: 0.208,  // 0.16 * 1.3
  2: 0.33,   // 0.22 * 1.5 — deep-sea bonus
  3: 0.45,   // 0.30 * 1.5 — deep-sea bonus
  4: 0.525,  // 0.35 * 1.5 — deep-sea bonus
};

// Solid black 1x1 pixel PNG as data URI
const BLACK_TEXTURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFHDZAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const bioluminescenceTheme: GlobeTheme = {
  id: 'bioluminescence',
  name: 'Bioluminescence',
  tagline: '35,000+ fish species — night mode',

  globeTexture: BLACK_TEXTURE,
  atmosphereColor: '#001122',
  backgroundColor: '#000000',
  terrain: {
    bumpMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
    bumpScale: 6,
    specularMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
    specular: '#112233',
    shininess: 8,
  },

  // Points are invisible — sprite layers handle all visual rendering.
  // Core Globe still needs points for click hit-testing (raycasting).
  pointColor: (_item: PointItem) => 'rgba(0,0,0,0)',
  pointSize: (item: PointItem) => {
    if ((item as Record<string, unknown>)._isCluster) {
      const count = (item as Record<string, unknown>)._count as number;
      if (count <= 1) return 0.2;
      return Math.min(2.5, 0.2 + Math.sqrt(count) * 0.03);
    }
    return RARITY_SIZES[item.rarity as number] ?? 0.156;
  },
  clusterColor: (count: number) => {
    if (count > 500) return '#ff5c8a';
    if (count > 100) return '#ffda5c';
    if (count > 20) return '#6eeab8';
    return '#5cd4ff';
  },

  colors: {
    primary: '#4cc9f0',
    surface: 'rgba(0, 2, 8, 0.85)',
    text: 'rgba(180, 220, 255, 0.95)',
    textMuted: 'rgba(100, 160, 220, 0.6)',
    accent: '#4cc9f0',
    gradient: ['#000000', '#000810'] as [string, string],
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
