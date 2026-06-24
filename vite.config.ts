/// <reference types="vitest/config" />
import path from 'path'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    VueI18nPlugin({
      include: [path.resolve(__dirname, './src/locales/**')],
      // The planner guided tour (driver.js) renders popover copy as HTML, so a few
      // tour messages contain <b> tags. All messages are developer-authored static
      // strings (no user input), so relax the AOT HTML guard rather than escaping it.
      strictMessage: false,
      escapeHtml: false,
    }),
  ],
  base: process.env.CF_PAGES === '1' ? '/' : '/k2-wiki/app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vue-vendor', test: /node_modules\/(vue|vue-router|@vue|vue-i18n|@intlify)/ },
            { name: 'vueuse', test: /node_modules\/@vueuse/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
