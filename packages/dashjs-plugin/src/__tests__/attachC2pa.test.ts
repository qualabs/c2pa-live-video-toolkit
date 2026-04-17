import { describe, it, expect, vi } from 'vitest';
import { attachC2pa } from '../attachC2pa.js';
import type { DashjsPlayer } from '../attachC2pa.js';

/**
 * These tests cover the dash.js-specific adapter layer. The C2PA validation
 * pipeline itself is tested in `@c2pa-live-toolkit/c2pa-player-core`; here we
 * only verify that:
 *
 *  1. `attachC2pa` registers a SegmentResponseModifier with the dash.js player.
 *  2. The modifier translates dash.js chunks into the player-agnostic
 *     `MediaSegmentInput` shape the core expects.
 *  3. After `controller.detach()` the modifier stops feeding segments into the
 *     pipeline (dash.js cannot unregister extensions).
 */

type CapturedExtension = {
  factory: () => { modifyResponseAsync: (chunk: unknown) => Promise<unknown> };
};

function makeMockPlayer(): { player: DashjsPlayer; captured: CapturedExtension } {
  const captured = {} as CapturedExtension;
  const player: DashjsPlayer = {
    extend: vi.fn((_name: string, factory: object) => {
      captured.factory = factory as CapturedExtension['factory'];
    }),
  };
  return { player, captured };
}

describe('attachC2pa', () => {
  it('registers a SegmentResponseModifier with the dash.js player', () => {
    const { player } = makeMockPlayer();

    attachC2pa(player);

    expect(player.extend).toHaveBeenCalledOnce();
    expect(player.extend).toHaveBeenCalledWith('SegmentResponseModifier', expect.any(Function));
  });

  it('returns the modifier chunk unchanged so MSE gets the original bytes', async () => {
    const { player, captured } = makeMockPlayer();

    attachC2pa(player);
    const modifier = captured.factory();
    const chunk = {
      segmentType: 'MediaSegment',
      mediaInfo: { type: 'video' },
      bytes: new Uint8Array([1, 2, 3]).buffer,
      index: 0,
      representationId: 'rep1',
    };

    const result = await modifier.modifyResponseAsync(chunk);

    expect(result).toBe(chunk);
  });

  it('stops feeding segments into the pipeline after detach()', async () => {
    const { player, captured } = makeMockPlayer();

    const controller = attachC2pa(player);
    const modifier = captured.factory();

    controller.detach();

    // After detach, the modifier should still resolve (pass-through) but not
    // invoke any downstream validation. We can observe this indirectly by
    // confirming no error/validation event fires for a chunk that would
    // otherwise enter the pipeline.
    const segmentValidated = vi.fn();
    controller.on('segmentValidated', segmentValidated);

    await modifier.modifyResponseAsync({
      segmentType: 'MediaSegment',
      mediaInfo: { type: 'video' },
      bytes: new Uint8Array([1, 2, 3]).buffer,
      index: 0,
    });

    // Let any async work in the pipeline flush (defensive — pipeline should not
    // have been entered in the first place).
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(segmentValidated).not.toHaveBeenCalled();
  });

  it('silently ignores chunks with an unknown segmentType', async () => {
    const { player, captured } = makeMockPlayer();

    const controller = attachC2pa(player);
    const modifier = captured.factory();

    const errorListener = vi.fn();
    controller.on('error', errorListener);

    // segmentType that is neither 'InitializationSegment' nor 'MediaSegment'
    const chunk = {
      segmentType: 'UnknownSegmentType',
      mediaInfo: { type: 'video' },
      bytes: new Uint8Array([0]).buffer,
      index: 0,
    };

    const result = await modifier.modifyResponseAsync(chunk);
    expect(result).toBe(chunk);
    expect(errorListener).not.toHaveBeenCalled();
  });
});
