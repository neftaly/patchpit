import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import { sandboxCompatApp } from './apps/sandbox-compat/app.ts';
import { readSandboxCompatBundle } from './apps/sandbox-compat/build.ts';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sandboxCompatArtifactPath = '__patchpit/apps/sandbox-compat';

export default defineConfig({
  base: process.env.PATCHPIT_BASE ?? '/',
  build: {
    rollupOptions: {
      input: {
        index: repoPath('index.html'),
        sandboxServiceWorker: repoPath('src/browser/sandbox-service-worker.ts'),
      },
      output: {
        entryFileNames: ({ name }) => name === 'sandboxServiceWorker'
          ? '__patchpit/sandbox/service-worker.js'
          : 'assets/[name]-[hash].js',
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
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    sandboxServiceWorkerPlugin(),
    sandboxCompatArtifactPlugin(),
  ],
});

function sandboxServiceWorkerPlugin(): Plugin {
  return {
    name: 'patchpit-sandbox-service-worker',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = `${server.config.base}__patchpit/sandbox/service-worker.js`;
        if (request.url?.split('?', 1)[0] !== path) return next();
        const result = await server.transformRequest('/src/browser/sandbox-service-worker.ts');
        if (result === null) return next();
        response.setHeader('Content-Type', 'text/javascript');
        response.end(result.code);
      });
    },
  };
}

function sandboxCompatArtifactPlugin(): Plugin {
  const artifact = async () => {
    const { packageFiles } = await readSandboxCompatBundle();
    return {
      files: packageFiles.map(({ bytes, contentType, name, order }) => ({
        bytes,
        ...(contentType === undefined ? {} : { contentType }),
        name,
        order,
        url: encodeURIComponent(name),
      })),
      manifest: {
        type: 'patchpit.demo-files@1',
        rootFolderId: sandboxCompatApp.id,
      },
    };
  };
  return {
    name: 'patchpit-sandbox-compat-artifact',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const base = `${server.config.base}${sandboxCompatArtifactPath}/`;
        const requestPath = request.url?.split('?', 1)[0];
        if (requestPath?.startsWith(base) !== true) return next();
        const packaged = await artifact();
        const relativePath = requestPath.slice(base.length);
        if (relativePath === 'files.json') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({
            ...packaged.manifest,
            files: packaged.files.map(({ bytes: _bytes, ...file }) => file),
          }));
          return;
        }
        const name = decodeURIComponent(relativePath);
        const file = packaged.files.find((candidate) => candidate.name === name);
        if (file === undefined) return next();
        response.setHeader('Content-Type', file.contentType ?? 'application/octet-stream');
        response.end(file.bytes);
      });
    },
    async generateBundle() {
      const packaged = await artifact();
      for (const file of packaged.files) {
        this.emitFile({
          type: 'asset',
          fileName: `${sandboxCompatArtifactPath}/${file.url}`,
          source: file.bytes,
        });
      }
      this.emitFile({
        type: 'asset',
        fileName: `${sandboxCompatArtifactPath}/files.json`,
        source: JSON.stringify({
          ...packaged.manifest,
          files: packaged.files.map(({ bytes: _bytes, ...file }) => file),
        }),
      });
    },
  };
}
