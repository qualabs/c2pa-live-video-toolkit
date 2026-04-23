# @qualabs/c2pa-live-origin-server

Static file server that serves C2PA-signed DASH segments and ad segments. In production, this role would be fulfilled by a CDN or Cloud Storage.

## Endpoints

- `GET /*` — Serves signed segments from `processed/output/`
- `GET /ads/*` — Serves ad segments from `processed/ads/`
- `GET /health` — Health check (returns 200 OK)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `STATIC_FILES_PATH` | `../live-streaming` | Root directory containing `processed/` subdirectory |

## Docker

```bash
docker build -t c2pa-origin-server .
docker run -p 8081:8081 -v /path/to/segments:/usr/src/app/live-streaming c2pa-origin-server
```
