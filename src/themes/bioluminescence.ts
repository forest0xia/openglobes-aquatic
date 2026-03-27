import type { AquaticTheme } from './types';

// Solid black 1x1 pixel PNG as data URI
const BLACK_TEXTURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFHDZAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const bioluminescenceTheme: AquaticTheme = {
  id: 'bioluminescence',
  name: 'Bioluminescence',

  globeTexture: BLACK_TEXTURE,
  atmosphereColor: '#001122',
  backgroundColor: '#000000',
  terrain: {
    bumpMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
    bumpScale: 6,
    specularMap: '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
    specularColor: '#112233',
    shininess: 8,
  },

  colors: {
    primary: '#4cc9f0',
    surface: 'rgba(0, 2, 8, 0.85)',
    text: 'rgba(180, 220, 255, 0.95)',
    textMuted: 'rgba(100, 160, 220, 0.6)',
    accent: '#4cc9f0',
  },
};
