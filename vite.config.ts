import type { ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';
import { createSandboxUrlMount } from '@patchpit/sandbox';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sandboxCompatRoot = repoPath('apps/sandbox-compat/static');
const sandboxCompatUrlBackedFile = repoPath('apps/sandbox-compat/url-backed/Ghostscript_Tiger.svg');

export default defineConfig({
  plugins: [wasm(), sandboxCompatMount()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        index: repoPath('index.html'),
      },
    },
  },
});

function sandboxCompatMount(): Plugin {
  return {
    name: 'patchpit-sandbox-compat-mount',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const mount = createSandboxUrlMount({
          baseUrl: requestUrl,
          entry: ['index.html'],
          files: await sandboxCompatFiles(),
          mountId: 'sandbox-compat',
        });
        const mountResponse = await mount.respond(new Request(requestUrl, { method: request.method ?? 'GET' }));
        if (mountResponse === undefined) {
          next();
          return;
        }
        await writeWebResponse(response, mountResponse);
      });
    },
  };
}

const sandboxCompatFiles = async () => [
  ...await staticFiles(sandboxCompatRoot),
  sandboxCompatFile(['ghostscript-tiger.svg'], sandboxCompatUrlBackedFile),
];

const staticFiles = async (root: string, dir = root): Promise<readonly ReturnType<typeof sandboxCompatFile>[]> =>
  (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory()
      ? staticFiles(root, path)
      : [sandboxCompatFile(relative(root, path).split(sep), path)];
  }))).flat();

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
