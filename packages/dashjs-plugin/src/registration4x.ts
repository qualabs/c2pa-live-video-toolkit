import type { MediaSegmentInput } from '@qualabs/c2pa-live-player-core';
import type { DashjsPlayer, DashjsChunk, RouteSegment } from './types.js';
import { buildSegmentInput } from './adapters.js';

function adaptDashjsChunk(chunk: DashjsChunk): MediaSegmentInput | null {
  return buildSegmentInput(chunk.segmentType, chunk.mediaInfo.type, chunk.bytes, chunk.index, chunk.representationId);
}

// Called only when typeof player.extend === 'function' is confirmed.
// Returns a cleanup that sets the detach flag (extensions cannot be unregistered in 4.x).
export function registerModifier4x(player: DashjsPlayer, route: RouteSegment): () => void {
  let isDetached = false;
  player.extend!('SegmentResponseModifier', () => ({
    modifyResponseAsync: async (chunk: unknown) => {
      if (!isDetached) {
        const input = adaptDashjsChunk(chunk as DashjsChunk);
        if (input) await route(input);
      }
      return Promise.resolve(chunk);
    },
  }));
  return () => { isDetached = true; };
}
