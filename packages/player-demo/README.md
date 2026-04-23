# @qualabs/c2pa-live-player-demo

Reference React/Vite demo app showcasing real-time C2PA validation in two modes:

- **video.js enhanced** — Full UI with colored progress bar, content credentials menu, and friction modal (`videojs-ui` + `dashjs-plugin`)
- **dash.js native** — Validation-only mode using `dashjs-plugin` with a custom data inspector

## Prerequisites

The Docker pipeline must be running so the demo can consume the live DASH stream:

```bash
# From the repository root
cp .env.example .env
docker compose up --build
```

## Development

```bash
npm run dev
```

Starts Vite on `http://localhost:3008`. The dev server proxies requests to:

| Path | Target | Service |
|---|---|---|
| `/stream.mpd`, `/stream_with_ad.mpd`, `/attack/*`, `/streamer/*`, `*.m4s` | `http://localhost:8083` | attack-proxy |
| `/manifest*` | `http://localhost:3000` | manifest-server |

Proxy ports are configurable via environment variables:

```bash
VITE_PROXY_PORT=8083 VITE_ORIGIN_PORT=3000 npm run dev
```

## Routes

| Route | Mode | Description |
|---|---|---|
| `/videojs-enhanced` | video.js + UI | Default. Full C2PA UI overlays on the video player |
| `/dashjs-native` | dash.js only | Validation data displayed in a side panel |

The root `/` redirects to `/videojs-enhanced`.

## Tech Stack

React 18, Vite, React Router, dash.js, video.js, styled-components, Framer Motion.
