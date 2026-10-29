import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  // Watch never cleans, so the playground never sees dist half written.
  clean: !options.watch,
  minify: true,
  // Preact is bundled so the host app never needs it and versions never clash.
  noExternal: ['preact'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.jsxImportSource = 'preact'
  },
}))
