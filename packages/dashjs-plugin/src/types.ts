import type { MediaSegmentInput } from '@qualabs/c2pa-live-player-core';

// ─── dash.js 4.x ─────────────────────────────────────────────────────────────

// Chunk passed to SegmentResponseModifier — only fields this plugin reads
export type DashjsChunk = {
  segmentType: 'InitializationSegment' | 'MediaSegment';
  mediaInfo: { type: string };
  bytes: ArrayBuffer | Uint8Array;
  index: number;
  representationId?: string | number;
};

// ─── dash.js 5.x ─────────────────────────────────────────────────────────────

// Minimal subset of FragmentRequest embedded in CommonMediaRequest.customData.request
export type Dash5xRequestMetadata = {
  type?: string | null;
  mediaType?: string;
  representationId?: string | number;
  index?: number;
};

// Minimal subset of CommonMediaResponse passed to addResponseInterceptor
export type Dash5xCommonMediaResponse = {
  request?: { customData?: { request?: Dash5xRequestMetadata } };
  data?: unknown;
};

export type Dash5xResponseInterceptor = (
  response: Dash5xCommonMediaResponse,
) => Promise<Dash5xCommonMediaResponse>;

// ─── shared ──────────────────────────────────────────────────────────────────

export type RouteSegment = (input: MediaSegmentInput) => Promise<void>;

// ─── public interface ─────────────────────────────────────────────────────────

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
