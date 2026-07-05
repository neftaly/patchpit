import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const appsRoot = resolve(repoRoot, 'apps');

export default defineConfig({
  clearScreen: false,
  root: repoRoot,
  plugins: [wasm(), topLevelAwait(), react()],
  resolve: {
    alias: {
      'node:zlib': resolve(repoRoot, 'apps/terminal/src/node-zlib.browser.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    cssCodeSplit: true,
    outDir: 'dist',
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      input: appEntries(),
      output: {
        manualChunks(id) {
          if (id.includes('@automerge')) return 'automerge';
          if (id.includes('just-bash')) return 'just-bash';
          if (id.includes('@xterm')) return 'xterm';
        },
      },
    },
  },
});

function appEntries(): Record<string, string> {
  const entries: Array<[string, string]> = [['index', resolve(repoRoot, 'index.html')]];
  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const html = resolve(appsRoot, entry.name, 'index.html');
    if (existsSync(html)) entries.push([entry.name, html]);
  }
  return Object.fromEntries(entries);
}
