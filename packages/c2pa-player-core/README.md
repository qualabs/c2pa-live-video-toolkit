# @c2pa-live-toolkit/c2pa-player-core

Player-agnostic C2PA live video validation core. Shared engine powering [`@c2pa-live-toolkit/dashjs-plugin`](../dashjs-plugin) and any future `hlsjs-plugin` / `shaka-plugin`.

This package does **not** talk to any streaming library directly. It exposes a generic pipeline that accepts raw segment bytes (plus minimal metadata) and emits typed validation events. Adapters (one per player) are responsible for intercepting segments from their specific player and feeding them into this pipeline.

## When should you use this directly?

Most consumers should use a player-specific plugin like `@c2pa-live-toolkit/dashjs-plugin`. Use this package directly only if you are:

- Building a new adapter for a streaming library not yet supported
- Running C2PA validation outside the context of a JS player (Node.js, workers, tests)

## Quick Start

```ts
import { createC2paPipeline, C2paEvent } from '@c2pa-live-toolkit/c2pa-player-core';

const pipeline = createC2paPipeline({ mediaTypes: ['video', 'audio'] });

pipeline.controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
  console.log(`Segment ${record.segmentNumber}: ${record.status}`);
});

// Feed each intercepted segment into the pipeline:
await pipeline.route({
  kind: 'media',
  mediaType: 'video',
  bytes: segmentBytes,
  streamId: 'video-rep1',
});
```

## Full API documentation

See [`@c2pa-live-toolkit/dashjs-plugin`](../dashjs-plugin) — the event types, status enums, and error codes are identical and documented there.
