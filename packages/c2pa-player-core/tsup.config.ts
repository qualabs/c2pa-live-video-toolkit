import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Bundle all .d.ts into a single index.d.ts so each player plugin that
  // inlines the core gets one self-contained declaration file.
  // @svta/cml-c2pa stays external — it's a public library, not internal code.
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
