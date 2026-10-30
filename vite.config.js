import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
