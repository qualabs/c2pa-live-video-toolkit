# @qualabs/c2pa-live-player-core

> **Internal package — not published to npm.**
> Marked `"private": true` in `package.json`. Each player plugin in this monorepo bundles this package's code directly into its own published output via `tsup` (`noExternal: ['@qualabs/c2pa-live-player-core']`). External consumers install only the player plugin (e.g. [`@qualabs/c2pa-live-dashjs-plugin`](../dashjs-plugin)) and get everything in a single package.

Player-agnostic C2PA live video validation core. Shared engine powering `@qualabs/c2pa-live-dashjs-plugin` and any future `hlsjs-plugin` / `shaka-plugin`.

This package does not talk to any streaming library directly. It exposes a generic pipeline that accepts raw segment bytes (plus minimal metadata) and emits typed validation events. Adapters (one per player) are responsible for intercepting segments from their specific player and feeding them into this pipeline.

## The adapter contract

Each player plugin does three things:

1. Calls `createC2paPipeline(options)` and stores the returned `pipeline.controller` — this is what the end consumer holds.
2. Hooks into its player's segment-interception API (`SegmentResponseModifier` for dash.js, custom loader for hls.js, `registerResponseFilter` for shaka).
3. Converts each intercepted chunk into a `MediaSegmentInput` and calls `pipeline.route(input)`.

```ts
export type MediaSegmentInput = {
  kind: 'init' | 'media';
  mediaType: 'video' | 'audio';
  bytes: Uint8Array;
  segmentIndex: number;
  streamId?: string | number;
};
```

## Quick Start (for adapter authors)

```ts
import { createC2paPipeline, C2paEvent } from '@qualabs/c2pa-live-player-core';

const pipeline = createC2paPipeline({
  mediaTypes: ['video', 'audio'],
  onDetach: () => {
    // Called when the consumer invokes controller.detach().
    // Use this to stop feeding segments into the pipeline.
  },
});

pipeline.controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
  console.log(`Segment ${record.segmentNumber}: ${record.status}`);
});

// In your player-interception callback, for each segment:
await pipeline.route({
  kind: 'media',
  mediaType: 'video',
  bytes: segmentBytes,
  segmentIndex: 1,
  streamId: 'video-rep1',
});
```

## Full API documentation

See [`@qualabs/c2pa-live-dashjs-plugin`](../dashjs-plugin) — the event types, status enums, and error codes are identical and documented there. The plugin re-exports the entire core public API, so consumer-facing docs live in the plugin package.
