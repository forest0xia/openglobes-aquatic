import type { AquaticTheme } from './types';

export const fishTheme: AquaticTheme = {
  id: 'fish',
  name: 'AquaticGlobe',

  globeTexture: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  atmosphereColor: '#4cc9f0',
  backgroundColor: '#050a12',
  terrain: {
    bumpMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
    bumpScale: 10,
    specularMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
    specularColor: 'grey',
    shininess: 15,
  },

  colors: {
    primary: '#4cc9f0',
    surface: 'rgba(8, 16, 32, 0.72)',
    text: 'rgba(230, 240, 255, 0.95)',
    textMuted: 'rgba(160, 180, 210, 0.72)',
    accent: '#4cc9f0',
  },
};
