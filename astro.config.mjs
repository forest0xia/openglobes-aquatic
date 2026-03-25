import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // Pre-bundle heavy deps at server start (not on first request).
      include: [
        'three',
        'three/examples/jsm/controls/OrbitControls.js',
        'three-globe',
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
    },
    // Treat pre-built core as external — skip Vite transform
    ssr: { noExternal: [] },
  },
  output: 'static',
});
