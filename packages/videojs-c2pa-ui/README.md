# @c2pa-live-toolkit/videojs-c2pa-ui

Video.js UI components for real-time C2PA validation: colored progress bar showing per-segment status, content credentials menu, and friction modal for invalid streams.

## Installation

```bash
npm install @c2pa-live-toolkit/videojs-c2pa-ui
```

video.js must be installed separately as a peer dependency:

```bash
npm install video.js
```

## Quick Start

```ts
import { C2paPlayerUI } from '@c2pa-live-toolkit/videojs-c2pa-ui';
import '@c2pa-live-toolkit/videojs-c2pa-ui/styles';

// Assumes `videoPlayer` is a video.js Player and `c2paController` comes from dashjs-c2pa-plugin
const ui = C2paPlayerUI(videoPlayer, c2paController);

// Later, when tearing down:
ui.destroy();
```

## API

### `C2paPlayerUI(videoPlayer, c2paController, options?): C2paPlayerInstance`

Attaches C2PA UI overlays to a video.js player and wires them to a `C2paController`.

| Parameter | Type | Description |
|---|---|---|
| `videoPlayer` | `VideoJsPlayer` | A video.js player instance |
| `c2paController` | `C2paControllerEvents` | Any object with `on`/`off` for `'playbackStatus'` events |
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

## Additional Exports

```ts
import { providerInfoFromSocialUrl } from '@c2pa-live-toolkit/videojs-c2pa-ui';
import { formatTime } from '@c2pa-live-toolkit/videojs-c2pa-ui';
```

| Export | Description |
|---|---|
| `providerInfoFromSocialUrl(url)` | Parses a social media URL and returns provider branding info |
| `formatTime(seconds)` | Formats a number of seconds into `HH:MM:SS` display string |

## Styles

Import the CSS file to apply the default component styles:

```ts
import '@c2pa-live-toolkit/videojs-c2pa-ui/styles';
```
