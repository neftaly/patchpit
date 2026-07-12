import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import { readSandboxCompatBundle } from './apps/sandbox-compat/node.ts';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sandboxCompatBundleId = 'virtual:patchpit/sandbox-compat-bundle';
const resolvedSandboxCompatBundleId = `\0${sandboxCompatBundleId}`;

export default defineConfig({
  base: process.env.PATCHPIT_BASE ?? '/',
  build: {
    rollupOptions: {
      input: {
        index: repoPath('index.html'),
        sandboxServiceWorker: repoPath('src/sandbox-service-worker.ts'),
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
    sandboxCompatPlugin(),
  ],
});

function sandboxServiceWorkerPlugin(): Plugin {
  return {
    name: 'patchpit-sandbox-service-worker',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = `${server.config.base}__patchpit/sandbox/service-worker.js`;
        if (request.url?.split('?', 1)[0] !== path) return next();
        const result = await server.transformRequest('/src/sandbox-service-worker.ts');
        if (result === null) return next();
        response.setHeader('Content-Type', 'text/javascript');
        response.end(result.code);
      });
    },
  };
}

function sandboxCompatPlugin(): Plugin {
  return {
    name: 'patchpit-sandbox-compat-mount',
    resolveId(id) {
      return id === sandboxCompatBundleId ? resolvedSandboxCompatBundleId : undefined;
    },
    async load(id) {
      if (id !== resolvedSandboxCompatBundleId) return;
      const { packageFiles } = await readSandboxCompatBundle();
      const files = packageFiles.map(({ bytes, ...file }) => ({
        ...file,
        bytes: [...bytes],
        resourceRef: `sandbox-compat:${file.entryId}`,
      }));
      return `export default ${JSON.stringify({ files })}`;
    },
  };
}
