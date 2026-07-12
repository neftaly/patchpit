import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import babel from '@rolldown/plugin-babel';
import {
  createSandboxCompatMount,
  readSandboxCompatBundle,
  sandboxCompatPathPrefix,
} from './apps/sandbox-compat/node.ts';
import { respondWithSandboxUrlMount } from '@patchpit/sandbox/node';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sandboxCompatBundleId = 'virtual:patchpit/sandbox-compat-bundle';
const resolvedSandboxCompatBundleId = `\0${sandboxCompatBundleId}`;

export default defineConfig({
  base: process.env.PATCHPIT_BASE ?? '/',
  build: {
    rollupOptions: {
      input: { index: repoPath('index.html') },
      output: {
        manualChunks: (id) => id.includes('@automerge')
          || id.includes('@tarstate+automerge')
          || id.includes('/@tarstate/automerge/')
          ? 'automerge'
          : undefined,
      },
    },
    target: 'esnext',
  },
  optimizeDeps: { exclude: ['@automerge/automerge'] },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), sandboxCompatPlugin()],
});

function sandboxCompatPlugin(): Plugin {
  return {
    name: 'patchpit-sandbox-compat-mount',
    resolveId(id) {
      return id === sandboxCompatBundleId ? resolvedSandboxCompatBundleId : undefined;
    },
    async load(id) {
      if (id !== resolvedSandboxCompatBundleId) return;
      const { packageFiles } = await readSandboxCompatBundle();
      const files = packageFiles.map(({ bytes, ...file }) => ({ ...file, bytes: [...bytes] }));
      return `export default ${JSON.stringify({ files })}`;
    },
    async generateBundle() {
      const { packageFiles } = await readSandboxCompatBundle();
      for (const { bytes, name } of packageFiles) {
        this.emitFile({
          type: 'asset',
          fileName: `${sandboxCompatPathPrefix.slice(1)}${name}`,
          source: bytes,
        });
      }
    },
    configureServer(server) {
      server.middlewares.use(sandboxCompatMiddleware);
    },
    configurePreviewServer(server) {
      const staticPrefix = `${server.config.base}${sandboxCompatPathPrefix.slice(1)}`;
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith(staticPrefix)) response.setHeader('Access-Control-Allow-Origin', '*');
        next();
      });
      server.middlewares.use(sandboxCompatMiddleware);
    },
  };
}

async function sandboxCompatMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  if (!request.url?.startsWith(sandboxCompatPathPrefix)) return next();
  const baseUrl = requestBaseUrl(request);
  if (baseUrl === undefined) {
    response.writeHead(400, { 'Content-Type': 'text/plain' }).end('Invalid Host header');
    return;
  }
  const mount = await createSandboxCompatMount(baseUrl);
  if (await respondWithSandboxUrlMount(mount, request, response)) return;
  response.writeHead(404).end();
}

function requestBaseUrl(request: IncomingMessage): URL | undefined {
  try {
    return new URL('/', `http://${request.headers.host ?? 'localhost'}`);
  } catch {
    return undefined;
  }
}
