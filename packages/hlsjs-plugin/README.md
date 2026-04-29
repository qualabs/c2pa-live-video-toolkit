# @qualabs/c2pa-live-hlsjs-plugin

hls.js adapter for real-time C2PA segment validation in live DASH/HLS streams.
Part of the [C2PA Live Video Toolkit](https://github.com/qualabs/c2pa-live-video-toolkit).

## Install

```bash
npm install @qualabs/c2pa-live-hlsjs-plugin hls.js
```

## Usage

```ts
import Hls from 'hls.js';
import { attachC2pa, C2paEvent } from '@qualabs/c2pa-live-hlsjs-plugin';

const hls = new Hls();

// Must be called BEFORE hls.loadSource()
const c2pa = attachC2pa(hls);
c2pa.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
  console.log(record.status, record.segmentIndex);
});

hls.loadSource('https://example.com/stream.m3u8');
hls.attachMedia(videoElement);

// On teardown
c2pa.detach();
hls.destroy();
```

## CMAF-only

C2PA requires fMP4/CMAF segments. The plugin works with **CMAF HLS** playlists
(`#EXT-X-MAP` + `.m4s` segments). Classic MPEG-TS segments pass through
unvalidated.

## Safari caveat

When Safari uses its built-in HLS engine, bytes never flow through hls.js's
loader, so C2PA validation does not happen. Detect this with `Hls.isSupported()`
and surface a warning to users.
