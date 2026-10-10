import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

// Same suite in WebKit (Safari's engine), on demand: npx playwright test -c playwright.webkit.config.ts
// WebKit has no clipboard permission, so tests that read the clipboard don't apply here.
export default defineConfig({
  ...base,
  use: { ...base.use, permissions: [] },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 860 } } }],
})
