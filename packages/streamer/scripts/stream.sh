#!/bin/sh
SCRIPT_DIR="$(dirname "$0")"
. "$SCRIPT_DIR/config.sh"

mkdir -p "$OUTPUT_DIR"

echo "Starting multi-quality DASH live stream (1080p / 720p / 180p) + audio (128 kbps / 64 kbps)..."

# -filter_complex split=3: one decode, three scaled outputs — avoids re-decoding per quality
# Demo input is only 320x180, so the top rendition mainly preserves compression quality better
# while the lowest rendition is intentionally starved to make ABR switches visually obvious.
# -g:v 96 -keyint_min:v 96 -sc_threshold:v 0: aligned keyframes every 4 s @ 24 fps across all renditions
# -b:v:N / -maxrate:v:N / -bufsize:v:N: CBR-like profile per rendition for predictable segment sizes
# -adaptation_sets "id=0,streams=v id=1,streams=a": one video AdaptationSet with 3 Representations + one audio
ffmpeg -loglevel warning -nostats \
  -stream_loop -1 -re -i "$INPUT_VIDEO" \
  -filter_complex "[0:v]split=3[v1][v2][v3]; \
    [v1]scale=1920:1080:flags=lanczos[out1]; \
    [v2]scale=1280:720:flags=bicubic[out2];  \
    [v3]scale=320:180:flags=fast_bilinear[out3]" \
  -map "[out1]" -c:v:0 libx264 -preset:v:0 medium -b:v:0 8000k -maxrate:v:0 9000k -bufsize:v:0 16000k \
  -map "[out2]" -c:v:1 libx264 -preset:v:1 medium -b:v:1 2200k -maxrate:v:1 2500k -bufsize:v:1  4400k \
  -map "[out3]" -c:v:2 libx264 -preset:v:2 veryfast -b:v:2  220k -maxrate:v:2  260k -bufsize:v:2   440k \
  -map 0:a -c:a:0 aac -b:a:0 128k -ar:a:0 48000 -ac:a:0 2 \
  -map 0:a -c:a:1 aac -b:a:1  64k -ar:a:1 48000 -ac:a:1 2 \
  -g:v 96 -keyint_min:v 96 -sc_threshold:v 0 \
  -seg_duration 4 \
  -window_size 375 \
  -extra_window_size 75 \
  -remove_at_exit 0 \
  -use_template 1 -use_timeline 1 \
  -init_seg_name "init-stream\$RepresentationID\$.m4s" \
  -media_seg_name "chunk-stream\$RepresentationID\$-\$Number%05d\$.m4s" \
  -adaptation_sets "id=0,streams=v id=1,streams=a" \
  -f dash "$OUTPUT_DIR/$MPD_FILE"
