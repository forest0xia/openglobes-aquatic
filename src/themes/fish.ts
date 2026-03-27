import type { GlobeTheme, PointItem } from '@openglobes/core';

export const fishTheme: GlobeTheme = {
  id: 'fish',
  name: 'AquaticGlobe',
  tagline: '200,000+ aquatic species worldwide',

  globeTexture: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  atmosphereColor: '#4cc9f0',
  backgroundColor: '#050a12',
  terrain: {
    bumpMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
    bumpScale: 10,
    specularMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
    specular: 'grey',
    shininess: 15,
  },

  // Points are invisible — sprite layers handle all visual rendering.
  // Core Globe still needs points for click hit-testing (raycasting).
  // No core Globe points — sprite layer handles all rendering
  pointColor: (_item: PointItem) => 'rgba(0,0,0,0)',
  pointSize: (_item: PointItem) => 0.1,
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
