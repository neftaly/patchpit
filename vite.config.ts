import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    VitePWA({
      devOptions: { enabled: true, type: 'module' },
      filename: 'sandbox-url-mount-sw.ts',
      injectManifest: { injectionPoint: '' },
      injectRegister: false,
      manifest: false,
      srcDir: 'packages/sandbox/src',
      strategies: 'injectManifest',
    }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        index: repoPath('index.html'),
        'hello-world': repoPath('apps/hello-world/index.html'),
      },
    },
  },
});
