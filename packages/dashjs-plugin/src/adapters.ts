import type { MediaSegmentInput, MediaType } from '@qualabs/c2pa-live-player-core';

const SEGMENT_KIND: Record<string, 'init' | 'media'> = {
  InitializationSegment: 'init',
  MediaSegment: 'media',
};

// Bytes are copied into a fresh Uint8Array because dash.js transfers the
// underlying ArrayBuffer to MSE after the handler resolves, detaching the buffer.
export function buildSegmentInput(
  segmentType: string | null | undefined,
  mediaType: string,
  rawBytes: ArrayBuffer | Uint8Array,
  index: number,
  streamId?: string | number,
): MediaSegmentInput | null {
  const kind = SEGMENT_KIND[segmentType ?? ''];
  if (!kind) return null;
  const source = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
  return { kind, mediaType: mediaType as MediaType, bytes: new Uint8Array(source), segmentIndex: index + 1, streamId };
}
