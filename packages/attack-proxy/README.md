# @qualabs/c2pa-live-attack-proxy

C2PA attack simulation proxy for DASH streams. Proxies segments from the origin server while optionally applying attacks that trigger C2PA validation failures, preserving DASH player playback integrity.

## Attacks

| Type | Description |
|---|---|
| `gap` | Serves a zero-sample segment (moof + empty mdat) to create a C2PA chain discontinuity |
| `out-of-order` | Swaps content of two consecutive segments while adjusting moof timeline data |
| `replay` | Replays a previous segment in a future slot with adjusted moof metadata |
| `mdat-swap` | Replaces mdat (media data) with content from a different source, keeping moof |

## API

```
POST /attack/gap          — Arm gap attack
POST /attack/out-of-order — Arm out-of-order attack
POST /attack/replay       — Arm replay attack
POST /attack/mdat-swap    — Arm mdat-swap attack
POST /attack/disable      — Disable active attack
GET  /attack/status       — Get current attack state

POST /streamer/restart    — Restart the streamer Docker container

GET  *.m4s                — Proxied segments (with optional attack applied)
GET  /stream_with_ad.mpd  — Proxied manifest
GET  *                    — Fallback proxy to origin
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8083` | Server port |
| `STATIC_SERVER_URL` | `http://origin-server:8081` | Origin server URL |

## Docker

Requires Docker socket mounted for streamer restart functionality:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```
