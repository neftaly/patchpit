import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import { sandboxCompatMount, sandboxCompatPathPrefix } from './apps/sandbox-compat/node.ts';
import { respondWithSandboxUrlMount } from '@patchpit/sandbox/node';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: { input: { index: repoPath('index.html') } },
    target: 'esnext',
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), sandboxCompatPlugin()],
});

function sandboxCompatPlugin(): Plugin {
  return {
    name: 'patchpit-sandbox-compat-mount',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const baseUrl = new URL('/', `http://${request.headers.host ?? 'localhost'}`);
        if (!request.url?.startsWith(sandboxCompatPathPrefix)) return next();
        const mount = await sandboxCompatMount(baseUrl);
        if (await respondWithSandboxUrlMount(mount, request, response)) return;
        next();
      });
    },
  };
}
