import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import { markdownEditorApp } from './apps/markdown-editor/app.ts';
import { readMarkdownEditorBundle } from './apps/markdown-editor/build.ts';
import { sandboxCompatApp } from './apps/sandbox-compat/app.ts';
import { readSandboxCompatBundle } from './apps/sandbox-compat/build.ts';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const demoApps = [{ app: sandboxCompatApp, readBundle: readSandboxCompatBundle }, {
  app: markdownEditorApp,
  readBundle: readMarkdownEditorBundle,
}] as const;

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
    demoAppArtifactsPlugin(),
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

function demoAppArtifactsPlugin(): Plugin {
  const artifact = async ({ app, readBundle }: typeof demoApps[number]) => {
    const { packageFiles } = await readBundle();
    const missingTextFile = app.textFiles.find((textFile) =>
      !packageFiles.some(({ name }) => name === textFile));
    if (missingTextFile !== undefined) {
      throw new Error(`Demo app text file is unavailable: ${app.id}/${missingTextFile}`);
    }
    return {
      files: packageFiles.map(({ bytes, contentType, name, order }) => ({
        bytes,
        ...(contentType === undefined ? {} : { contentType }),
        contentKind: app.textFiles.some((textFile) => textFile === name) ? 'text' : 'binary',
        name,
        order,
        url: encodeURIComponent(name),
      })),
      manifest: {
        type: 'patchpit.demo-files@1',
        rootFolderId: app.id,
        title: app.title,
      },
    };
  };
  const developmentArtifacts = new Map<string, ReturnType<typeof artifact>>();
  const developmentArtifact = (selected: typeof demoApps[number]) => {
    const cached = developmentArtifacts.get(selected.app.id);
    if (cached !== undefined) return cached;
    const pending = artifact(selected);
    developmentArtifacts.set(selected.app.id, pending);
    return pending;
  };
  return {
    name: 'patchpit-demo-app-artifacts',
    configureServer(server) {
      server.watcher.on('all', (_event, path) => {
        const selected = demoApps.find(({ app }) =>
          path.startsWith(repoPath(`apps/${app.id}/`)));
        if (selected !== undefined) developmentArtifacts.delete(selected.app.id);
      });
      server.middlewares.use(async (request, response, next) => {
        const requestPath = request.url?.split('?', 1)[0];
        const selected = demoApps.find(({ app }) => requestPath?.startsWith(
          `${server.config.base}${demoAppArtifactPath(app.id)}/`,
        ) === true);
        if (selected === undefined || requestPath === undefined) return next();
        const base = `${server.config.base}${demoAppArtifactPath(selected.app.id)}/`;
        const packaged = await developmentArtifact(selected);
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
      for (const selected of demoApps) {
        const packaged = await artifact(selected);
        const artifactPath = demoAppArtifactPath(selected.app.id);
        for (const file of packaged.files) {
          this.emitFile({
            type: 'asset',
            fileName: `${artifactPath}/${file.url}`,
            source: file.bytes,
          });
        }
        this.emitFile({
          type: 'asset',
          fileName: `${artifactPath}/files.json`,
          source: JSON.stringify({
            ...packaged.manifest,
            files: packaged.files.map(({ bytes: _bytes, ...file }) => file),
          }),
        });
      }
    },
  };
}

const demoAppArtifactPath = (appId: string) => `__patchpit/apps/${appId}`;
