/// <reference types="vitest/config" />
import path from 'path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  base: '/k2-wiki/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    assetsInlineLimit: 0,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
