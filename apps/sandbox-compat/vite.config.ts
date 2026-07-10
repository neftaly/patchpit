import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: './',
  build: {
    assetsDir: '',
    outDir: appPath('dist'),
    target: 'esnext',
  },
  root: appPath('.'),
});
