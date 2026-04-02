# @c2pa-live/streamer

FFmpeg-based live DASH stream generator with ad insertion support. Produces the input stream that the signer consumes.

## Components

- **scripts/** — Shell scripts for FFmpeg streaming and cleanup
- **ad-insertion/** — Python HTTP server serving dynamic DASH manifests with ad support
- **manifest-templates/** — MPD template files for ad-insertion endpoints
- **input/** — Source video files

## Scripts

```bash
# Start FFmpeg streaming (runs from Docker working_dir /host_stream)
sh scripts/start-all.sh
```

## Manifest Server

The Python ad-insertion server runs on port 3000 and exposes:
- `GET /manifest` — manifest1.mpd with live reset
- `GET /manifest2` — manifest2.mpd with live reset
- `GET /manifest3` — manifest3.mpd with live reset
- `GET /manifest4` — manifest4.mpd with live reset

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `STREAM_ROOT` | `/app/live-streaming` | Root path containing `processed/output/` for manifest output |
| `TEMPLATES_DIR` | `/app/manifest-templates` | Path to MPD template files |
