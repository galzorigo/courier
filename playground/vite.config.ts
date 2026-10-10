import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // Reachable on the LAN for phone testing.
  server: { host: true, port: 5173 },
})
