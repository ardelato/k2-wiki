import { defineConfig } from '@playwright/test'

const basePath = process.env.CF_PAGES === '1' ? '/' : '/k2-wiki/app/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:4173${basePath}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run preview',
    url: `http://localhost:4173${basePath}`,
    reuseExistingServer: !process.env.CI,
  },
})
