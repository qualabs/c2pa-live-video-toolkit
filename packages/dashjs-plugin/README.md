# @c2pa-live-toolkit/dashjs-plugin

Framework-agnostic dash.js plugin for real-time C2PA segment validation. Validates each DASH segment as it is downloaded using [`@svta/cml-c2pa`](https://www.npmjs.com/package/@svta/cml-c2pa), the [SVTA Common Media Library](https://github.com/streaming-video-technology-alliance/common-media-library) C2PA validator.

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
import { attachC2pa, C2paEvent } from '@c2pa-live-toolkit/dashjs-plugin';

const player = dashjs.MediaPlayer().create();
const c2pa = attachC2pa(player);

c2pa.on(C2paEvent.SEGMENT_VALIDATED, (e) => {
  console.log(`Segment ${e.segmentNumber}: ${e.status}`);
});

player.initialize(videoElement, 'https://example.com/stream.mpd', true);
```

## How It Works

The plugin registers as a dash.js `SegmentResponseModifier`, intercepting every downloaded segment before it reaches the media buffer. Init segments are processed first to extract session keys (for the VSI method). Each subsequent media segment is then validated through `@svta/cml-c2pa`'s validation functions, which verify cryptographic signatures, check sequence continuity, and detect replay or reorder attacks. Results are emitted as typed events that any UI layer can consume.

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
  logger?: Logger | false;             // Custom logger or false to disable all logs
};
```

### `C2paController`

#### Event methods

```ts
c2pa.on(C2paEvent.SEGMENT_VALIDATED, (e) => { ... });
c2pa.once(C2paEvent.INIT_PROCESSED, (e) => { ... });
c2pa.off(C2paEvent.SEGMENT_VALIDATED, handler);
```

#### Query methods


#### Lifecycle methods

```ts
c2pa.reset();    // Clear all state (call when changing streams)
c2pa.detach();   // Full cleanup — removes all listeners and disables validation
```

## Events

### `segmentValidated`

Fired after each media segment is validated.

```ts
type SegmentRecord = {
  segmentNumber: number;
  mediaType: MediaType;
  sequenceNumber: number;
  keyId: string;
  hash: string;
  status: SegmentStatusValue;
  sequenceReason?: SequenceAnomalyReasonValue;
  timestamp: number;
  arrivalIndex: number;
  errorCodes?: readonly ValidationErrorCode[];
  manifest?: C2paManifest | null;
  previousManifestId?: string | null;
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
  verified: VerificationStatus;
  details: Partial<Record<MediaType, PlaybackStatusDetail>>;
};

type PlaybackStatusDetail = {
  verified: VerificationStatus;
  manifest: C2paManifest | null;
  error: PlaybackDiagnosticValue | null;
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
import { ERROR_CODE_MESSAGES, C2paEvent } from '@c2pa-live-toolkit/dashjs-plugin';

c2pa.on(C2paEvent.SEGMENT_VALIDATED, (e) => {
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
