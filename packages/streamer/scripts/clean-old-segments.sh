#!/bin/sh
SCRIPT_DIR="$(dirname "$0")"
. "$SCRIPT_DIR/config.sh"

# Maximum age of segment files in seconds before cleanup (default: ~8 minutes)
MAX_AGE_SECONDS=500

cleanup() {
  echo "Interrupted! Cleaning up and exiting..."
  exit 0
}

trap cleanup INT TERM

while true; do

  find "$OUTPUT_DIR" -type f \( -name "*.m4s" -o -name "*.mpd" \) -mmin +$((MAX_AGE_SECONDS / 60)) -exec rm -v {} \;

  sleep 10
done
