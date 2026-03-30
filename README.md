# C2PA Live Video Toolkit

A collection of open-source tools for embedding and verifying [C2PA](https://c2pa.org/) provenance in live DASH video streams.

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│   streamer  │───▶│    signer   │───▶│ origin-server│───▶│  attack-proxy    │
│  (FFmpeg)   │    │  (C2PA TS)  │    │  (static)    │    │  (DASH proxy)    │
└─────────────┘    └─────────────┘    └──────────────┘    └──────────────────┘
                                            ▲
                                   ┌────────────────┐
                                   │ manifest-server│
                                   │   (Python)     │
                                   └────────────────┘
```

| Service | Package | Port | Description |
|---|---|---|---|
| `streamer` | `stream-source` | — | FFmpeg generates live DASH segments |
| `signer` | `signer` | 8080 | Signs each segment with C2PA provenance |
| `origin-server` | `origin-server` | 8081 (→8082) | Serves signed segments as static files |
| `manifest-server` | `stream-source` | 3000 | Serves dynamic DASH manifests with ad insertion |
| `attack-proxy` | `attack-proxy` | 8083 | Proxies segments, optionally applying C2PA attacks |

DASH players point to `http://localhost:8083/stream_with_ad.mpd`.

## Prerequisites

- Docker and Docker Compose v2
- Node.js 18+ and npm 10+ (for local development only)

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/qualabs/c2pa-live-video-toolkit.git
cd c2pa-live-video-toolkit
npm install

# 2. Configure (optional — services have sensible defaults)
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

### [`@c2pa-live/stream-source`](packages/stream-source)

FFmpeg streaming scripts and Python ad-insertion manifest server. Generates the raw DASH stream that the signer consumes.

### [`@c2pa-live/attack-proxy`](packages/attack-proxy)

DASH proxy that can simulate C2PA validation failures for testing and demonstration. Supports four attack types:

| Attack | Description |
|---|---|
| `gap` | Serves a zero-sample segment to create a C2PA chain discontinuity |
| `out-of-order` | Swaps content of two consecutive segments |
| `replay` | Replays a previous segment in a future slot |
| `mdat-swap` | Replaces media data with content from a different source |

See [packages/attack-proxy/README.md](packages/attack-proxy/README.md) for the full API.

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

Copy `.env.example` to `.env` to override defaults. All variables are optional — the stack runs without a `.env` file.

| Variable | Default | Service | Description |
|---|---|---|---|
| `STORAGE_PROVIDER` | `LOCAL` | signer | Storage backend (`LOCAL` or `GCS`) |
| `INPUT_BUCKET` | `/host_stream` | signer | Path to raw segments |
| `OUTPUT_BUCKET` | `/host_stream` | signer | Path to write signed segments |
| `MPD_KEY` | `output/stream.mpd` | signer | Path to output DASH manifest |
| `USE_VSI_METHOD` | `false` | signer | Use VSI signing strategy |
| `DEBUG` | `false` | signer | Enable verbose logging |
| `STATIC_FILES_PATH` | `/usr/src/app/live-streaming` | origin-server | Root directory for static files |
| `PORT` | `8083` | attack-proxy | Proxy server port |
| `STATIC_SERVER_URL` | `http://origin-server:8081` | attack-proxy | Upstream origin URL |
| `STREAM_ROOT` | `/app/live-streaming` | manifest-server | Path for manifest output |

## License

[LICENSE](LICENSE)
