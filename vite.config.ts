import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sandboxCompatRoot = repoPath('apps/sandbox-compat/static');
const sandboxCompatUrlBackedFile = repoPath('apps/sandbox-compat/url-backed/Ghostscript_Tiger.svg');
const sandboxCompatRoute = ['__patchpit', 'sandbox', 'sandbox-compat'];

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
        const path = sandboxCompatPath(requestUrl);
        if (path === undefined) {
          next();
          return;
        }

        const file = sandboxCompatFile(path);
        if (file === undefined) {
          response.writeHead(404).end();
          return;
        }
        const body = await readFile(file).catch(() => undefined);
        if (body === undefined) {
          response.writeHead(404).end();
          return;
        }

        response.writeHead(200, sandboxUrlMountHeaders(contentType(file), requestUrl.origin));
        response.end(body);
      });
    },
  };
}

function sandboxCompatPath(url: URL): readonly string[] | undefined {
  const segments = url.pathname.split('/').filter((segment) => segment !== '').map(decodeURIComponent);
  return sameSegments(segments.slice(0, sandboxCompatRoute.length), sandboxCompatRoute)
    ? segments.slice(sandboxCompatRoute.length)
    : undefined;
}

function sandboxCompatFile(path: readonly string[]) {
  const filePath = path.length === 0 ? ['index.html'] : path;
  if (filePath.join('/') === 'ghostscript-tiger.svg') return sandboxCompatUrlBackedFile;
  const file = resolve(sandboxCompatRoot, ...filePath);
  return file.startsWith(`${sandboxCompatRoot}${sep}`) ? file : undefined;
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

function sameSegments(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function sandboxUrlMountHeaders(contentType: string, mountOrigin: string) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Security-Policy': [
      `default-src 'none'`,
      `base-uri 'none'`,
      `connect-src ${mountOrigin}`,
      `font-src ${mountOrigin} data:`,
      `form-action 'none'`,
      `frame-src ${mountOrigin}`,
      `img-src ${mountOrigin} data:`,
      `media-src ${mountOrigin}`,
      `object-src 'none'`,
      `script-src 'unsafe-inline' ${mountOrigin}`,
      `style-src 'unsafe-inline' ${mountOrigin}`,
      `worker-src 'none'`,
    ].join('; '),
    'Content-Type': contentType,
    'Timing-Allow-Origin': '*',
  };
}
