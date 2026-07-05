import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const systemBenchEntry = fileURLToPath(new URL('./system-bench.ts', import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: false,
    outDir: '.bench',
    rollupOptions: {
      output: {
        entryFileNames: 'bench.mjs',
        format: 'esm',
      },
    },
    ssr: 'scripts/bench.ts',
    target: 'esnext',
  },
  ssr: {
    noExternal: [/^@patchpit\//, /^@tarstate\//],
  },
  resolve: {
    alias: {
      '@patchpit/system': systemBenchEntry,
    },
  },
});
