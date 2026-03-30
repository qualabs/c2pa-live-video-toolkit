#!/bin/sh
SCRIPT_DIR="$(dirname "$0")"
. "$SCRIPT_DIR/config.sh"

echo "Cleaning up output directory before starting..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo "Starting DASH live stream, and cleanup..."

# Start all subprocesses and store their PIDs
"$SCRIPT_DIR/stream.sh" &
STREAM_PID=$!

"$SCRIPT_DIR/clean-old-segments.sh" &
CLEAN_PID=$!

# Handle script termination (Ctrl+C or exit)
cleanup() {
    echo "Stopping all background processes..."
    kill $STREAM_PID $CLEAN_PID 2>/dev/null
    wait $STREAM_PID $CLEAN_PID 2>/dev/null

    echo "Cleaning up output directory..."
    rm -rf "$OUTPUT_DIR"

    echo "All processes stopped and cleaned up."
    exit 0
}

# Trap termination signals
trap cleanup INT TERM

# Wait forever (or until Ctrl+C is pressed)
wait
