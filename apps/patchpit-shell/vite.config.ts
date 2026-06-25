import react from '@vitejs/plugin-react'
import { appendFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/patchpit/' : '/',
  plugins: [
    publicSourceMapComments(),
    royalShaderSource(),
    wasm(),
    topLevelAwait(),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: /^renderer$/,
        replacement: fileURLToPath(
          new URL(
            '../../vendor/royal/packages/renderer/src/index.ts',
            import.meta.url,
          ),
        ),
      },
      {
        find: /^renderer\/react$/,
        replacement: fileURLToPath(
          new URL(
            '../../vendor/royal/packages/renderer/src/react.tsx',
            import.meta.url,
          ),
        ),
      },
      {
        find: /^renderer\/patchpit-offscreen-react-root$/,
        replacement: fileURLToPath(
          new URL(
            '../../vendor/royal/packages/renderer/src/patchpit-offscreen-react-root.ts',
            import.meta.url,
          ),
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
    // GitHub Pages deploys dist as-is; keep source maps public for deployed debugging.
    // scripts/check-sourcemaps.mjs guards .js.map files and sourceMappingURL comments.
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
})

function publicSourceMapComments(): Plugin {
  return {
    name: 'public-source-map-comments',
    apply: 'build',
    async writeBundle(options, bundle) {
      const outputDir =
        options.dir ?? (options.file ? dirname(options.file) : null)
      if (!outputDir) return

      await Promise.all(
        Object.values(bundle).map(async (output) => {
          if (output.type !== 'chunk' || !output.fileName.endsWith('.js'))
            return

          const sourceMapFileName = `${output.fileName}.map`
          if (!bundle[sourceMapFileName]) return

          const outputPath = join(outputDir, output.fileName)
          const code = await readFile(outputPath, 'utf8')
          if (/\/\/# sourceMappingURL=\S+\s*$/.test(code)) return

          await appendFile(
            outputPath,
            `\n//# sourceMappingURL=${urlBasename(sourceMapFileName)}`,
          )
        }),
      )
    },
  }
}

function urlBasename(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf('/') + 1)
}

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
