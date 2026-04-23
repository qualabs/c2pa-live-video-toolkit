import {
  createC2paPipeline,
  type C2paController,
  type C2paOptions,
  type MediaSegmentInput,
  type MediaType,
} from '@qualabs/c2pa-live-player-core';

/**
 * Minimal structural interface for the dash.js player methods this plugin uses.
 * `override` is optional here so dashjs.MediaPlayerClass (whose `extend` declares
 * it as required) remains assignable without casts.
 */
export interface DashjsPlayer {
  extend(name: string, factoryOrChild: object, override?: boolean): void;
}

/**
 * Shape of the chunk object dash.js passes to a SegmentResponseModifier.
 * Only the fields this adapter reads are listed.
 */
type DashjsChunk = {
  segmentType: 'InitializationSegment' | 'MediaSegment';
  mediaInfo: { type: string };
  bytes: ArrayBuffer | Uint8Array;
  index: number;
  representationId?: string | number;
};

/**
 * Translate a dash.js chunk into the player-agnostic {@link MediaSegmentInput}
 * shape the core pipeline expects. Returns `null` for chunks with an unsupported
 * `segmentType` (anything other than Initialization/MediaSegment).
 *
 * Note: bytes are copied into a fresh Uint8Array because dash.js transfers the
 * underlying ArrayBuffer to MSE after `modifyResponseAsync` resolves, detaching
 * the original buffer.
 */
function adaptDashjsChunk(chunk: DashjsChunk): MediaSegmentInput | null {
  const kind =
    chunk.segmentType === 'InitializationSegment'
      ? 'init'
      : chunk.segmentType === 'MediaSegment'
        ? 'media'
        : null;
  if (!kind) return null;

  const source = chunk.bytes instanceof Uint8Array ? chunk.bytes : new Uint8Array(chunk.bytes);
  return {
    kind,
    mediaType: chunk.mediaInfo.type as MediaType,
    bytes: new Uint8Array(source),
    segmentIndex: chunk.index + 1,
    streamId: chunk.representationId,
  };
}

/**
 * Attaches C2PA validation to a dash.js player instance.
 *
 * Must be called BEFORE `player.initialize()` because dash.js registers
 * extension factories during initialization.
 *
 * @example
 * ```ts
 * const player = dashjs.MediaPlayer().create();
 * const c2pa = attachC2pa(player);
 * c2pa.on(C2paEvent.SEGMENT_VALIDATED, (record) => console.log(record.status));
 * player.initialize(videoElement, streamUrl, true);
 * ```
 */
export function attachC2pa(player: DashjsPlayer, options: C2paOptions = {}): C2paController {
  // Wire up detach flag — dash.js has no API to unregister extensions, so we
  // use a flag to make modifyResponseAsync a no-op after detach.
  let isDetached = false;

  const pipeline = createC2paPipeline({
    ...options,
    onDetach: () => {
      isDetached = true;
    },
  });

  player.extend('SegmentResponseModifier', () => ({
    modifyResponseAsync: async (chunk: unknown) => {
      if (!isDetached) {
        const input = adaptDashjsChunk(chunk as DashjsChunk);
        if (input) await pipeline.route(input);
      }
      return Promise.resolve(chunk);
    },
  }));

  return pipeline.controller;
}
