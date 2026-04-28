import {
  createC2paPipeline,
  type C2paController,
  type C2paOptions,
} from '@qualabs/c2pa-live-player-core';
import type { DashjsPlayer } from './types.js';
import { registerInterceptor5x } from './registration5x.js';
import { registerModifier4x } from './registration4x.js';

export type { DashjsPlayer };

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
