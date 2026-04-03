#!/bin/sh
SCRIPT_DIR="$(dirname "$0")"
. "$SCRIPT_DIR/config.sh"

mkdir -p "$OUTPUT_DIR"

echo "Starting DASH live stream (loop mode)..."

#-g 96 -keyint_min 96 -sc_threshold 0 is to force keyfrsmes every 4 seconds  FPS is 24 so 2s=48, 4s =96, 6s=144, 8s=192, 10s=240
ffmpeg -loglevel warning -nostats \
  -stream_loop -1 -re -i "$INPUT_VIDEO" \
  -c:v libx264 -c:a aac \
  -g 96 -keyint_min 96 -sc_threshold 0 \
  -seg_duration 4 \
  -window_size 375 \
  -extra_window_size 75 \
  -remove_at_exit 0 \
  -use_template 1 -use_timeline 1 \
  -init_seg_name "init-stream\$RepresentationID\$.m4s" \
  -media_seg_name "chunk-stream\$RepresentationID\$-\$Number%05d\$.m4s" \
  -adaptation_sets "id=0,streams=v id=1,streams=a" \
  -f dash "$OUTPUT_DIR/$MPD_FILE"
