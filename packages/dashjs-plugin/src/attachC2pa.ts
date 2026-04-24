import {
  createC2paPipeline,
  type C2paController,
  type C2paOptions,
  type MediaSegmentInput,
  type MediaType,
} from '@qualabs/c2pa-live-player-core';

/**
 * Minimal structural interface for the dash.js player methods this plugin uses.
 * Supports both dash.js 4.x (extend / SegmentResponseModifier) and 5.x
 * (addResponseInterceptor / removeResponseInterceptor).
 */
export interface DashjsPlayer {
  extend?: (name: string, factoryOrChild: object, override?: boolean) => void;
  addResponseInterceptor?: (interceptor: Dash5xResponseInterceptor) => void;
  removeResponseInterceptor?: (interceptor: Dash5xResponseInterceptor) => void;
}

// ─── internal types ───────────────────────────────────────────────────────────

// dash.js 4.x chunk (passed to SegmentResponseModifier)
type DashjsChunk = {
  segmentType: 'InitializationSegment' | 'MediaSegment';
  mediaInfo: { type: string };
  bytes: ArrayBuffer | Uint8Array;
  index: number;
  representationId?: string | number;
};

// dash.js 5.x response (passed to addResponseInterceptor) — minimal subset
type Dash5xRequestMetadata = {
  type?: string | null;
  mediaType?: string;
  representationId?: string | number;
  index?: number;
};
type Dash5xCommonMediaResponse = {
  request?: { customData?: { request?: Dash5xRequestMetadata } };
  data?: unknown;
};
type Dash5xResponseInterceptor = (
  response: Dash5xCommonMediaResponse,
) => Promise<Dash5xCommonMediaResponse>;

// ─── adapters ────────────────────────────────────────────────────────────────

const SEGMENT_KIND: Record<string, 'init' | 'media'> = {
  InitializationSegment: 'init',
  MediaSegment: 'media',
};

// Bytes are copied into a fresh Uint8Array because dash.js transfers the
// underlying ArrayBuffer to MSE after the handler resolves, detaching the buffer.
function buildSegmentInput(
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

function adaptDashjsChunk(chunk: DashjsChunk): MediaSegmentInput | null {
  return buildSegmentInput(chunk.segmentType, chunk.mediaInfo.type, chunk.bytes, chunk.index, chunk.representationId);
}

function adaptDashjsResponse5x(response: Dash5xCommonMediaResponse): MediaSegmentInput | null {
  const req = response.request?.customData?.request;
  if (!req || !(response.data instanceof ArrayBuffer)) return null;
  return buildSegmentInput(req.type, req.mediaType ?? 'video', response.data.slice(0), req.index ?? 0, req.representationId);
}

// ─── version-specific registration ───────────────────────────────────────────

type RouteSegment = (input: MediaSegmentInput) => Promise<void>;

// Called only when typeof player.addResponseInterceptor === 'function' is confirmed.
// Returns a cleanup that unregisters the interceptor and stops routing.
function registerInterceptor5x(player: DashjsPlayer, route: RouteSegment): () => void {
  let isDetached = false;
  const interceptor: Dash5xResponseInterceptor = async (response) => {
    if (!isDetached) {
      const input = adaptDashjsResponse5x(response);
      if (input) await route(input);
    }
    return response;
  };
  player.addResponseInterceptor!(interceptor);
  return () => {
    isDetached = true;
    player.removeResponseInterceptor?.(interceptor);
  };
}

// Called only when typeof player.extend === 'function' is confirmed.
// Returns a cleanup that sets the detach flag (extensions cannot be unregistered in 4.x).
function registerModifier4x(player: DashjsPlayer, route: RouteSegment): () => void {
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

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Attaches C2PA validation to a dash.js player instance.
 *
 * Supports dash.js 4.x and 5.x via feature detection:
 * - 5.x: uses `addResponseInterceptor` / `removeResponseInterceptor`
 * - 4.x: uses `player.extend('SegmentResponseModifier', ...)`
 *
 * For dash.js 4.x this must be called BEFORE `player.initialize()` because
 * dash.js registers extension factories during initialization.
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
  let cleanup: () => void = () => {};

  const pipeline = createC2paPipeline({ ...options, onDetach: () => cleanup() });

  if (typeof player.addResponseInterceptor === 'function') {
    cleanup = registerInterceptor5x(player, pipeline.route);
  } else if (typeof player.extend === 'function') {
    cleanup = registerModifier4x(player, pipeline.route);
  } else {
    throw new Error(
      '[@qualabs/c2pa-live-dashjs-plugin] Unsupported dash.js version: ' +
        'neither addResponseInterceptor (≥5.x) nor extend (4.x) found on the player instance.',
    );
  }

  return pipeline.controller;
}
