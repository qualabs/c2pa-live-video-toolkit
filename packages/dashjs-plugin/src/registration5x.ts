import type { MediaSegmentInput } from '@qualabs/c2pa-live-player-core';
import type { DashjsPlayer, Dash5xCommonMediaResponse, Dash5xResponseInterceptor, RouteSegment } from './types.js';
import { buildSegmentInput } from './adapters.js';

// dash.js 5.x does not populate req.representationId, so we derive a stable
// per-representation key from the URL by stripping the trailing segment number:
// "chunk-stream3-00289.m4s" → "chunk-stream3", "init-stream3.m4s" → "init-stream3"
function repIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const filename = url.split('/').pop() ?? '';
  return filename.replace(/-\d+\.m4s$/, '').replace(/\.m4s$/, '') || undefined;
}

function adaptDashjsResponse5x(response: Dash5xCommonMediaResponse): MediaSegmentInput | null {
  const req = response.request?.customData?.request;
  if (!req || !(response.data instanceof ArrayBuffer)) return null;
  const representationId = req.representationId ?? repIdFromUrl(response.request?.url);
  return buildSegmentInput(req.type, req.mediaType ?? 'video', response.data, req.index ?? 0, representationId);
}

// Called only when typeof player.addResponseInterceptor === 'function' is confirmed.
// Returns a cleanup that unregisters the interceptor and stops routing.
export function registerInterceptor5x(player: DashjsPlayer, route: RouteSegment): () => void {
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
