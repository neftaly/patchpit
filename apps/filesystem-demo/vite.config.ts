import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/patchpit/' : '/',
  plugins: [wasm(), topLevelAwait(), react()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
  },
})
