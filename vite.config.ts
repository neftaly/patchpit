import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import babel from '@rolldown/plugin-babel';
import { createSandboxCompatMount, sandboxCompatPathPrefix } from './apps/sandbox-compat/node.ts';
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
      server.middlewares.use(sandboxCompatMiddleware);
    },
    configurePreviewServer(server) {
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
