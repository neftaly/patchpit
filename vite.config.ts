import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import { createSandboxUrlMountFromFsFiles } from '@patchpit/sandbox-fs';
import { readSandboxFsDirectory } from '@patchpit/sandbox-fs/node';
import { respondWithSandboxUrlMount } from '@patchpit/sandbox/node';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sandboxCompatRoot = repoPath('apps/sandbox-compat/static');
const sandboxCompatUrlBackedFile = repoPath('apps/sandbox-compat/url-backed/Ghostscript_Tiger.svg');

export default defineConfig({
  build: {
    rollupOptions: { input: { index: repoPath('index.html') } },
    target: 'esnext',
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), wasm(), sandboxCompatMount()],
});

function sandboxCompatMount(): Plugin {
  return {
    name: 'patchpit-sandbox-compat-mount',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const baseUrl = new URL('/', `http://${request.headers.host ?? 'localhost'}`);
        const requestUrl = new URL(request.url ?? '/', baseUrl);
        if (!requestUrl.pathname.startsWith('/__patchpit/sandbox/sandbox-compat/')) return next();
        const mount = await sandboxCompatMountFor(baseUrl);
        if (await respondWithSandboxUrlMount(mount, request, response)) return;
        next();
      });
    },
  };
}

const sandboxCompatMountFor = async (baseUrl: URL) =>
  createSandboxUrlMountFromFsFiles([
    ...await readSandboxFsDirectory(sandboxCompatRoot, {
      src: (path) => `automerge:sandbox-compat/${path.join('/')}`,
    }),
    {
      body: new Uint8Array(await readFile(sandboxCompatUrlBackedFile)) as Uint8Array<ArrayBuffer>,
      contentType: 'image/svg+xml',
      path: ['ghostscript-tiger.svg'],
      src: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
    },
  ], {
    baseUrl,
    entry: ['index.html'],
    mountId: 'sandbox-compat',
  });
