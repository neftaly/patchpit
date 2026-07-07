import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const appsRoot = resolve(repoRoot, 'apps');

export default defineConfig({
  clearScreen: false,
  define: {
    __PATCHPIT_RUNTIME_BUILD_ID__: JSON.stringify(process.env.PATCHPIT_RUNTIME_BUILD_ID ?? `${Date.now().toString(36)}`),
  },
  root: repoRoot,
  plugins: [
    wasm(),
    topLevelAwait(),
    VitePWA({
      devOptions: { enabled: true, type: 'module' },
      filename: 'sandbox-url-mount-sw.ts',
      injectManifest: { injectionPoint: '' },
      injectRegister: false,
      manifest: false,
      srcDir: 'packages/sandbox/src',
      strategies: 'injectManifest',
    }),
    react(),
  ],
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
        },
      },
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
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
