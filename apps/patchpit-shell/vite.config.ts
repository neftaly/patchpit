import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/patchpit/' : '/',
  plugins: [royalShaderSource(), wasm(), topLevelAwait(), react()],
  resolve: {
    alias: [
      {
        find: /^renderer$/,
        replacement: fileURLToPath(
          new URL('../../vendor/royal/packages/renderer/src/index.ts', import.meta.url),
        ),
      },
      {
        find: /^renderer\/react$/,
        replacement: fileURLToPath(
          new URL('../../vendor/royal/packages/renderer/src/react.tsx', import.meta.url),
        ),
      },
    ],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/worker-[name]-[hash].js',
        entryFileNames: 'assets/worker-[name]-[hash].js',
      },
    },
  },
  build: {
    target: 'safari17',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
})

function royalShaderSource(): Plugin {
  return {
    name: 'royal-shader-source',
    enforce: 'pre',
    async load(id) {
      const [path] = id.split('?', 1)
      if (!path || !/\.(?:frag|vert|glsl)$/.test(path)) return null

      return `export default ${JSON.stringify(await readFile(path, 'utf8'))};`
    },
  }
}
