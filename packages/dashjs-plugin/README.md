# @c2pa-live-toolkit/dashjs-plugin

Framework-agnostic dash.js plugin for real-time C2PA segment validation. Validates each DASH segment as it is downloaded using the [Common Media Library](https://github.com/streaming-video-technology-alliance/common-media-library) C2PA validator.

## Installation

```bash
npm install @c2pa-live-toolkit/dashjs-plugin
```

dash.js must be installed separately as a peer dependency:

```bash
npm install dashjs
```

## Quick Start

`attachC2pa` must be called **before** `player.initialize()`.

```ts
import dashjs from 'dashjs';
import { attachC2pa } from '@c2pa-live-toolkit/dashjs-plugin';

const player = dashjs.MediaPlayer().create();
const c2pa = attachC2pa(player);

c2pa.on('segmentValidated', (e) => {
  console.log(`Segment ${e.segmentNumber}: ${e.status}`);
});

player.initialize(videoElement, 'https://example.com/stream.mpd', true);
```

## API

### `attachC2pa(player, options?): C2paController`

Attaches C2PA validation to a dash.js player instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `player` | `dashjs.MediaPlayer` | An initialized (but not yet started) dash.js player |
| `options` | `C2paOptions` | Optional configuration |

Returns a `C2paController` instance.

### `C2paOptions`

```ts
type C2paOptions = {
  mediaTypes?: ('video' | 'audio')[];  // Default: ['video', 'audio']
  maxStoredSegments?: number;           // Segment history limit. Default: 1000
  logger?: Logger | false;             // Custom logger or false to disable all logs
  onSegmentValidated?: (record: SegmentRecord) => void; // Direct callback per segment
};
```

### `C2paController`

#### Event methods

```ts
c2pa.on('segmentValidated', (e) => { ... });
c2pa.once('initProcessed', (e) => { ... });
c2pa.off('segmentValidated', handler);
```

#### Query methods

```ts
const segments = c2pa.getSegments();         // All validated SegmentRecord[]
const unsubscribe = c2pa.subscribeToSegments((segments) => { ... });
```

#### Lifecycle methods

```ts
c2pa.reset();    // Clear all state (call when changing streams)
c2pa.detach();   // Full cleanup — removes all listeners and disables validation
```

## Events

### `segmentValidated`

Fired after each media segment is validated.

```ts
type SegmentValidatedEvent = {
  segmentNumber: number;
  status: 'valid' | 'invalid' | 'replayed' | 'reordered' | 'missing' | 'warning';
  sequenceReason?: 'duplicate' | 'out_of_order' | 'gap_detected' | 'sequence_number_below_minimum';
  hash: string;
  keyId: string;
  mediaType: 'video' | 'audio';
  errorCodes?: readonly string[];
};
```

### `initProcessed`

Fired after the init segment is processed.

```ts
type InitProcessedEvent = {
  success: boolean;
  sessionKeysCount: number;
  manifestId: string | undefined;
  errorCodes?: readonly string[];
  error?: string;
};
```

### `playbackStatus`

Fired on each `PLAYBACK_TIME_UPDATED` event from dash.js.

```ts
type PlaybackStatus = {
  verified: boolean | undefined;  // undefined means inconclusive
  details: {
    video?: { verified: boolean | undefined; manifest: unknown; error: string | null };
    audio?: { verified: boolean | undefined; manifest: unknown; error: string | null };
  };
};
```

### `segmentsMissing`

Fired when a gap attack is detected (missing sequence numbers).

```ts
type SegmentsMissingEvent = { from: number; to: number; count: number };
```

### `error`

Fired on unexpected internal errors.

```ts
type ErrorEvent = { source: string; error: unknown };
```

### `reset`

Fired after `c2pa.reset()` is called.

## Validation Methods

The plugin automatically selects the appropriate C2PA validation method:

- **VSI (§19.4)**: Used when session keys are available in the init segment. Validates via COSE_Sign1 signatures in EMSG boxes. Detects replays, reorders, and gaps.
- **ManifestBox (§19.3)**: Fallback when no session keys are present. Each segment carries its own C2PA manifest.

## Multiple Players

Each `attachC2pa()` call creates isolated state — multiple players on the same page will not interfere with each other.

```ts
const c2paPlayer1 = attachC2pa(player1);
const c2paPlayer2 = attachC2pa(player2);
// Each has its own session key store, segment history, etc.
```

## Error Codes

```ts
import { ERROR_CODE_MESSAGES } from '@c2pa-live-toolkit/dashjs-plugin';

c2pa.on('segmentValidated', (e) => {
  for (const code of e.errorCodes ?? []) {
    console.error(ERROR_CODE_MESSAGES[code] ?? code);
  }
});
```

| Code | Meaning |
|------|---------|
| `livevideo.init.invalid` | Init segment is invalid (contains mdat box) |
| `livevideo.manifest.invalid` | C2PA manifest failed validation |
| `livevideo.segment.invalid` | Cryptographic verification failed |
| `livevideo.assertion.invalid` | Live video assertion invalid |
| `livevideo.continuityMethod.invalid` | Continuity chain broken |
| `livevideo.sessionkey.invalid` | Session key is invalid or expired |

## Limitations

- dash.js has no API to unregister extensions. After calling `detach()`, the `SegmentResponseModifier` becomes a pass-through but remains registered.
- `attachC2pa()` must be called before `player.initialize()`.
