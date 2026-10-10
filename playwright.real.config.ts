import { defineConfig, devices } from '@playwright/test'

// Runs against a real site with Courier installed (Simple Light on :3000).
export default defineConfig({
  testDir: 'e2e-real',
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env.REAL_URL ?? 'http://localhost:3000',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
