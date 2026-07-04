import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

const isAutomerge = (id: string): boolean => id.includes('@automerge');

export default defineConfig({
  clearScreen: false,
  plugins: [wasm(), topLevelAwait(), react()],
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (isAutomerge(id)) return 'automerge';
        },
      },
    },
  },
});
