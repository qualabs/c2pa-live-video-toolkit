# @c2pa-live-toolkit/videojs-ui

Video.js UI components for real-time C2PA validation: colored progress bar showing per-segment status, content credentials menu, and friction modal for invalid streams.

## Installation

```bash
npm install @c2pa-live-toolkit/videojs-ui
```

video.js must be installed separately as a peer dependency:

```bash
npm install video.js
```

## Prerequisites

This package requires a `C2paController` instance to receive validation events. In practice, this comes from calling `attachC2pa(dashPlayer)` in [`@c2pa-live-toolkit/dashjs-plugin`](../dashjs-plugin). However, `videojs-ui` is framework-agnostic — any object implementing `on('segmentValidated', handler)` and `off('segmentValidated', handler)` is compatible.

## Quick Start

```ts
import { C2paPlayerUI } from '@c2pa-live-toolkit/videojs-ui';
import '@c2pa-live-toolkit/videojs-ui/styles';

// c2paController comes from @c2pa-live-toolkit/dashjs-plugin
const ui = C2paPlayerUI(videoPlayer, c2paController);

// Later, when tearing down:
ui.destroy();
```

## Full Integration Example

```ts
import dashjs from 'dashjs';
import videojs from 'video.js';
import { attachC2pa } from '@c2pa-live-toolkit/dashjs-plugin';
import { C2paPlayerUI } from '@c2pa-live-toolkit/videojs-ui';
import '@c2pa-live-toolkit/videojs-ui/styles';

// 1. Create players
const dashPlayer = dashjs.MediaPlayer().create();
const vjsPlayer = videojs('my-video');

// 2. Attach C2PA validation (must be before dashPlayer.initialize)
const c2pa = attachC2pa(dashPlayer);

// 3. Initialize dash.js
dashPlayer.initialize(document.querySelector('video'), 'stream.mpd', true);

// 4. Wire up the UI
vjsPlayer.ready(() => {
  const ui = C2paPlayerUI(vjsPlayer, c2pa);
});
```

## API

### `C2paPlayerUI(videoPlayer, c2paController, options?): C2paPlayerInstance`

Attaches C2PA UI overlays to a video.js player and wires them to a `C2paController`.

| Parameter | Type | Description |
|---|---|---|
| `videoPlayer` | `VideoJsPlayer` | A video.js player instance |
| `c2paController` | `C2paControllerEvents` | Any object with `on`/`off` for `'segmentValidated'` events |
| `options` | `C2paPlayerOptions` | Optional configuration |

### `C2paPlayerOptions`

```ts
type C2paPlayerOptions = {
  isMonolithic?: boolean;       // Affects timeline seek logic. Default: false
  showFrictionModal?: boolean;  // Show friction modal on invalid manifest. Default: true
};
```

### `C2paPlayerInstance`

```ts
type C2paPlayerInstance = {
  destroy(): void;  // Unsubscribes from all events and cleans up DOM elements
};
```

## Components

| Component | Description |
|---|---|
| **C2paTimeline** | Colored progress bar overlaid on the video.js seek bar. Each segment is colored by validation status (valid, invalid, warning, unknown) |
| **C2paMenu** | Dropdown menu in the control bar showing content credentials, provider info, and per-segment validation details |
| **C2paFrictionModal** | Modal shown before playback when the stream manifest is invalid. Displayed once per session, dismissible by the user |

## Styles

Import the CSS file to apply the default component styles:

```ts
import '@c2pa-live-toolkit/videojs-ui/styles';
```
