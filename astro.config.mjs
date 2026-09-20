import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
  ],
  output: 'static',
  // The GitHub Pages workflow sets SITE and BASE for your own account/repo
  // (e.g. https://you.github.io + /kludgeknight/). Defaults keep local dev working.
  site: process.env.SITE ?? 'https://vinc3m1.github.io',
  base: process.env.BASE ?? '/',
  server: {
    port: 5173,
    host: true,
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      https: process.env.HTTPS === 'true',
    },
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  },
});
