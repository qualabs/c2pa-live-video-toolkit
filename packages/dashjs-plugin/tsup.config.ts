import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Generate bundled .d.ts so consumers get types without needing
  // @c2pa-live-toolkit/c2pa-player-core or @svta/cml-c2pa installed.
  // `resolve` tells tsup's dts bundler to follow imports from these packages
  // and inline their .d.ts files into the output — matching what the JS
  // bundler already does transitively.
  // Bundle the internal core into this package, but leave @svta/cml-c2pa as an
  // external dependency — it's a real public library, not internal plumbing.
  // Consumers will install it transitively via our `dependencies`.
  dts: {
    resolve: ['@c2pa-live-toolkit/c2pa-player-core'],
  },
  external: ['@svta/cml-c2pa'],
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // Inline the internal core package into the published bundle so it never has
  // to be published to npm. Anything not listed here is externalized by default
  // if it appears in `dependencies` or `peerDependencies` (dashjs is peer).
  noExternal: ['@c2pa-live-toolkit/c2pa-player-core'],
});
