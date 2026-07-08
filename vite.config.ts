import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [wasm()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        index: repoPath('index.html'),
      },
    },
  },
});
