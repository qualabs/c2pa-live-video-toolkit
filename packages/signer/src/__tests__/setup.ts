/**
 * Vitest setup — sets required environment variables so that
 * modules importing config.ts don't throw during test collection.
 */
process.env.INPUT_BUCKET ??= '/tmp/test-input';
process.env.MPD_KEY ??= 'stream.mpd';
process.env.OUTPUT_BUCKET ??= '/tmp/test-output';
