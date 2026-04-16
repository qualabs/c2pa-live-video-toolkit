# C2PA Live Video Toolkit

A collection of open-source tools for embedding and verifying [C2PA](https://c2pa.org/) provenance in live DASH video streams.

## Architecture

```
Server Pipeline:
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│   streamer  │───▶│    signer   │───▶│ origin-server│───▶│  attack-proxy    │
│  (FFmpeg)   │    │  (C2PA TS)  │    │  (static)    │    │  (DASH proxy)    │
└─────────────┘    └─────────────┘    └──────────────┘    └────────┬─────────┘
                                            ▲                      │
                                   ┌────────────────┐              │
                                   │ manifest-server│              │
                                   │   (Python)     │              │
                                   └────────────────┘              │
                                                                   ▼
Client (Browser):                                        ┌─────────────────┐
┌────────────────────────────────────────────────────────│   DASH Player   │
│                                                        └─────────────────┘
│  dashjs-plugin ──validates via──▶ @svta/cml-c2pa ──results──▶ videojs-ui
│  (intercepts segments)           (C2PA validator)       (timeline, menu,
│                                                          friction modal)
└───────────────────────────────────────────────────────────────────────────
```

On the player side, [`@c2pa-live-toolkit/dashjs-plugin`](packages/dashjs-plugin) intercepts each downloaded DASH segment and validates its C2PA provenance using [`@svta/cml-c2pa`](https://www.npmjs.com/package/@svta/cml-c2pa), the SVTA Common Media Library C2PA validator. The [`@c2pa-live-toolkit/videojs-ui`](packages/videojs-ui) package then renders the validation results as colored timeline segments, a content credentials menu, and an optional friction modal.

| Service | Package | Port | Description |
|---|---|---|---|
| `streamer` | `streamer` | — | FFmpeg generates live DASH segments |
| `signer` | `signer` | 8080 | Signs each segment with C2PA provenance |
| `origin-server` | `origin-server` | 8081 (→8082) | Serves signed segments as static files |
| `manifest-server` | `attack-proxy` | 3000 | Serves dynamic DASH manifests with ad insertion |
| `attack-proxy` | `attack-proxy` | 8083 | Proxies segments, optionally applying C2PA attacks |

DASH players point to `http://localhost:8083/stream_with_ad.mpd`.

## Prerequisites

- Docker and Docker Compose v2
- Node.js 22+ and npm 10+ (for local development only)

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/qualabs/c2pa-live-video-toolkit.git
cd c2pa-live-video-toolkit
npm install

# 2. Configure environment
cp .env.example .env

# 3. Build and start all services
docker compose up --build
```

The full pipeline starts automatically:
1. `streamer` encodes `BigBuckBunny_320x180.mp4` into DASH segments
2. `signer` watches for new segments and signs them with C2PA
3. `origin-server` serves the signed output
4. `attack-proxy` proxies everything on port 8083

Point a DASH player at: `http://localhost:8083/stream_with_ad.mpd`

## Packages

### [`@c2pa-live/signer`](packages/signer)

C2PA signing service. Polls the DASH manifest, downloads new segments, signs them using `c2patool`, and writes signed output to the shared volume.

Supports two signing strategies via `USE_VSI_METHOD`:
- **ManifestBox** (default) — embeds C2PA manifest inside the segment
- **VSI** — Verifiable Segment Information, external validation

### [`@c2pa-live/origin-server`](packages/origin-server)

Minimal Express static file server. Serves signed segments from the shared volume. In production this role would be fulfilled by a CDN.

### [`@c2pa-live/streamer`](packages/streamer)

FFmpeg streaming scripts. Generates the raw DASH stream that the signer consumes.

### [`@c2pa-live/attack-proxy`](packages/attack-proxy)

DASH proxy that can simulate C2PA validation failures for testing and demonstration. Supports four attack types:

| Attack | Description |
|---|---|
| `gap` | Serves a zero-sample segment to create a C2PA chain discontinuity |
| `out-of-order` | Swaps content of two consecutive segments |
| `replay` | Replays a previous segment in a future slot |
| `mdat-swap` | Replaces media data with content from a different source |

See [packages/attack-proxy/README.md](packages/attack-proxy/README.md) for the full API.

### [`@c2pa-live-toolkit/dashjs-plugin`](packages/dashjs-plugin)

Framework-agnostic dash.js plugin for real-time C2PA segment validation. Validates each DASH segment as it is downloaded, supporting both ManifestBox (§19.3) and VSI (§19.4) methods. Validation is powered by [`@svta/cml-c2pa`](https://www.npmjs.com/package/@svta/cml-c2pa), the SVTA Common Media Library C2PA validator.

### [`@c2pa-live-toolkit/videojs-ui`](packages/videojs-ui)

Video.js UI components for C2PA validation: colored progress bar showing segment status, content credentials menu, and friction modal for invalid streams. Consumes validation events from `dashjs-plugin`'s `C2paController` to visualize per-segment status in real time.

### [`@c2pa-live-toolkit/player-demo`](packages/player-demo)

Reference React/Vite demo app showcasing both plugins in two modes: dash.js native validation and video.js enhanced UI.

## Development

```bash
# Build all packages
npm run build

# Build a single package
npx turbo build --filter=@c2pa-live/signer

# Build Docker images without starting
docker compose build
```

## Environment Variables

Copy `.env.example` to `.env` before running. See `.env.example` for all available options.

| Variable | Default | Description |
|---|---|---|
| `STORAGE_PROVIDER` | `LOCAL` | Storage backend (`LOCAL` or `GCS`) |
| `INPUT_BUCKET` | `/host_stream` | Path to raw segments |
| `OUTPUT_BUCKET` | `/host_stream` | Path to write signed segments |
| `MPD_KEY` | `output/stream.mpd` | Path to output DASH manifest |
| `PUB_CERT` | `/app/certs/ps256.pub` | Public certificate for signing |
| `PRIV_KEY` | `/app/certs/ps256.pem` | Private key for signing |
| `USE_VSI_METHOD` | `false` | Use VSI signing strategy |
| `C2PATOOL_PATH` | `/usr/local/bin/c2patool` | Path to c2patool binary |
| `DEBUG` | `false` | Enable verbose logging |

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
