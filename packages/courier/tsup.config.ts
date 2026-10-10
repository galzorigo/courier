import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  // Preact is bundled so the host app never needs it and versions never clash.
  noExternal: ['preact'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.jsxImportSource = 'preact'
  },
})
