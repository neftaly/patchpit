import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: './',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  esbuild: { jsx: 'automatic', jsxDev: false },
  build: {
    assetsDir: '',
    cssCodeSplit: false,
    lib: {
      cssFileName: 'style',
      entry: appPath('main.tsx'),
      fileName: () => 'index.js',
      formats: ['es'],
    },
    outDir: appPath('dist'),
    target: 'esnext',
  },
  plugins: [appDocumentPlugin()],
});

function appDocumentPlugin(): Plugin {
  return {
    name: 'patchpit-markdown-editor-document',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Patchpit Markdown editor</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.js"></script>
  </body>
</html>
`,
      });
    },
  };
}
