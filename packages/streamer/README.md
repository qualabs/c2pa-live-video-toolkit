# @c2pa-live/streamer

FFmpeg-based live DASH stream generator. Produces the input stream that the signer consumes.

## Components

- **scripts/** — Shell scripts for FFmpeg streaming and cleanup
- **input/** — Source video files

## Scripts

```bash
# Start FFmpeg streaming (runs from Docker working_dir /host_stream)
sh scripts/start-all.sh
```
