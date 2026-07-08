import type { ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandboxUrlMount } from '@patchpit/sandbox';
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
  plugins: [wasm(), sandboxCompatMount()],
});

function sandboxCompatMount(): Plugin {
  return {
    name: 'patchpit-sandbox-compat-mount',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const mountResponse = await (await sandboxCompatMountFor(requestUrl)).respond(new Request(requestUrl, { method: request.method ?? 'GET' }));
        if (mountResponse === undefined) return next();
        await writeWebResponse(response, mountResponse);
      });
    },
  };
}

const sandboxCompatMountFor = async (baseUrl: URL) =>
  createSandboxUrlMount({
    baseUrl,
    entry: ['index.html'],
    files: [
      ...await sandboxCompatFiles(),
      sandboxCompatFile(['ghostscript-tiger.svg'], sandboxCompatUrlBackedFile),
    ],
    mountId: 'sandbox-compat',
  });

const sandboxCompatFiles = async () =>
  (await readdir(sandboxCompatRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => sandboxCompatFile([entry.name], resolve(sandboxCompatRoot, entry.name)));

const sandboxCompatFile = (path: readonly string[], file: string) => ({
  path,
  read: async () => ({ body: await readFile(file), contentType: contentType(file) }),
});

async function writeWebResponse(response: ServerResponse, webResponse: Response) {
  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  response.end(webResponse.body === null ? undefined : new Uint8Array(await webResponse.arrayBuffer()));
}

function contentType(path: string) {
  const type = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  }[extname(path)];
  if (type === undefined) throw new Error(`Unknown sandbox compat content type: ${path}`);
  return type;
}
