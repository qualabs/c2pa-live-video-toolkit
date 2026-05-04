import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    resolve: ['@qualabs/c2pa-live-player-core'],
  },
  external: ['@svta/cml-c2pa'],
  clean: true,
  sourcemap: true,
  target: 'es2022',
  noExternal: ['@qualabs/c2pa-live-player-core'],
});
