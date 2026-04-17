#!/bin/sh
SCRIPT_DIR="$(dirname "$0")"
. "$SCRIPT_DIR/config.sh"

mkdir -p "$OUTPUT_DIR"

echo "Starting DASH live stream (loop mode)..."

# Video re-encode with ultrafast/zerolatency: input is 320x180 H.264 @24fps —
# we keep libx264 (not copy) because DASH needs keyframes aligned with
# seg_duration, and the source keyframe layout cannot be guaranteed.
# Audio is already AAC, so copy it (no CPU cost).
# -g 96 -keyint_min 96 -sc_threshold 0 forces keyframes every 4 seconds at 24 fps.
# Window: 30 segments = ~2 min live window — keeps the MPD small and lets the
# player reach "hot" state quickly after startup.
# UTC_TIMING_URL: published in the MPD's <UTCTiming> element. Without it, dash.js
# falls back to an external time server (time.akamai.com) whose CORS-blocked response
# makes the player stall without requesting any media segments. Default points to the
# attack-proxy, which is the entry point the demo consumes.
UTC_TIMING_URL="${UTC_TIMING_URL:-http://localhost:8083/time}"

ffmpeg -loglevel warning -nostats \
  -stream_loop -1 -re -i "$INPUT_VIDEO" \
  -c:v libx264 -preset medium -tune zerolatency \
  -c:a copy \
  -g 96 -keyint_min 96 -sc_threshold 0 \
  -seg_duration 4 \
  -window_size 30 \
  -extra_window_size 10 \
  -remove_at_exit 0 \
  -use_template 1 -use_timeline 1 \
  -utc_timing_url "$UTC_TIMING_URL" \
  -init_seg_name "init-stream\$RepresentationID\$.m4s" \
  -media_seg_name "chunk-stream\$RepresentationID\$-\$Number%05d\$.m4s" \
  -adaptation_sets "id=0,streams=v id=1,streams=a" \
  -f dash "$OUTPUT_DIR/$MPD_FILE"
