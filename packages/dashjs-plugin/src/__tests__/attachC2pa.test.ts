import { describe, it, expect, vi } from 'vitest';
import { attachC2pa } from '../attachC2pa.js';
import type { DashjsPlayer } from '../attachC2pa.js';

/**
 * These tests cover the dash.js-specific adapter layer. The C2PA validation
 * pipeline itself is tested in `@qualabs/c2pa-live-player-core`; here we
 * only verify that:
 *
 *  1. `attachC2pa` hooks into the player using the correct API for each version.
 *  2. The adapter translates player-specific data into the player-agnostic
 *     `MediaSegmentInput` shape the core expects.
 *  3. After `controller.detach()` the adapter stops feeding segments into the
 *     pipeline (and removes the interceptor where supported).
 */

// ─── 4.x helpers ─────────────────────────────────────────────────────────────

type CapturedExtension = {
  factory: () => { modifyResponseAsync: (chunk: unknown) => Promise<unknown> };
};

function makeMockPlayer4x(): { player: DashjsPlayer; captured: CapturedExtension } {
  const captured = {} as CapturedExtension;
  const player: DashjsPlayer = {
    extend: vi.fn((_name: string, factory: object) => {
      captured.factory = factory as CapturedExtension['factory'];
    }),
  };
  return { player, captured };
}

// ─── 5.x helpers ─────────────────────────────────────────────────────────────

type Dash5xResponse = {
  request?: { customData?: { request?: Record<string, unknown> } };
  data?: unknown;
};

type CapturedInterceptor = {
  fn?: (response: Dash5xResponse) => Promise<Dash5xResponse>;
};

function makeMockPlayer5x(): { player: DashjsPlayer; captured: CapturedInterceptor } {
  const captured: CapturedInterceptor = {};
  const player: DashjsPlayer = {
    addResponseInterceptor: vi.fn((fn) => {
      captured.fn = fn as CapturedInterceptor['fn'];
    }),
    removeResponseInterceptor: vi.fn(),
  };
  return { player, captured };
}

function makeResponse5x(
  segmentType: string,
  mediaType = 'video',
  index = 0,
): Dash5xResponse {
  return {
    request: {
      customData: {
        request: { type: segmentType, mediaType, index, representationId: 'rep1' },
      },
    },
    data: new Uint8Array([1, 2, 3]).buffer,
  };
}

// ─── dash.js 4.x tests ───────────────────────────────────────────────────────

describe('attachC2pa (dash.js 4.x — SegmentResponseModifier)', () => {
  it('registers a SegmentResponseModifier with the dash.js player', () => {
    const { player } = makeMockPlayer4x();

    attachC2pa(player);

    expect(player.extend).toHaveBeenCalledOnce();
    expect(player.extend).toHaveBeenCalledWith('SegmentResponseModifier', expect.any(Function));
  });

  it('returns the modifier chunk unchanged so MSE gets the original bytes', async () => {
    const { player, captured } = makeMockPlayer4x();

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
    const { player, captured } = makeMockPlayer4x();

    const controller = attachC2pa(player);
    const modifier = captured.factory();

    controller.detach();

    const segmentValidated = vi.fn();
    controller.on('segmentValidated', segmentValidated);

    await modifier.modifyResponseAsync({
      segmentType: 'MediaSegment',
      mediaInfo: { type: 'video' },
      bytes: new Uint8Array([1, 2, 3]).buffer,
      index: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(segmentValidated).not.toHaveBeenCalled();
  });

  it('silently ignores chunks with an unknown segmentType', async () => {
    const { player, captured } = makeMockPlayer4x();

    const controller = attachC2pa(player);
    const modifier = captured.factory();

    const errorListener = vi.fn();
    controller.on('error', errorListener);

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

// ─── dash.js 5.x tests ───────────────────────────────────────────────────────

describe('attachC2pa (dash.js 5.x — addResponseInterceptor)', () => {
  it('registers a response interceptor with the dash.js player', () => {
    const { player } = makeMockPlayer5x();

    attachC2pa(player);

    expect(player.addResponseInterceptor).toHaveBeenCalledOnce();
    expect(player.addResponseInterceptor).toHaveBeenCalledWith(expect.any(Function));
  });

  it('returns the response unchanged so MSE gets the original bytes', async () => {
    const { player, captured } = makeMockPlayer5x();

    attachC2pa(player);
    const response = makeResponse5x('MediaSegment');

    const result = await captured.fn!(response);

    expect(result).toBe(response);
  });

  it('stops routing segments after detach() and removes the interceptor', async () => {
    const { player, captured } = makeMockPlayer5x();

    const controller = attachC2pa(player);

    controller.detach();

    expect(player.removeResponseInterceptor).toHaveBeenCalledOnce();
    expect(player.removeResponseInterceptor).toHaveBeenCalledWith(captured.fn);

    const segmentValidated = vi.fn();
    controller.on('segmentValidated', segmentValidated);

    await captured.fn!(makeResponse5x('MediaSegment'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(segmentValidated).not.toHaveBeenCalled();
  });

  it('silently ignores responses with an unknown segment type', async () => {
    const { player, captured } = makeMockPlayer5x();

    const controller = attachC2pa(player);
    const errorListener = vi.fn();
    controller.on('error', errorListener);

    const response = makeResponse5x('UnknownSegmentType');
    const result = await captured.fn!(response);

    expect(result).toBe(response);
    expect(errorListener).not.toHaveBeenCalled();
  });

  it('silently ignores responses with no data (e.g. MPD fetches)', async () => {
    const { player, captured } = makeMockPlayer5x();

    const controller = attachC2pa(player);
    const errorListener = vi.fn();
    controller.on('error', errorListener);

    const response: Dash5xResponse = {
      request: {
        customData: { request: { type: 'MediaSegment', mediaType: 'video', index: 0 } },
      },
      data: undefined,
    };

    const result = await captured.fn!(response);
    expect(result).toBe(response);
    expect(errorListener).not.toHaveBeenCalled();
  });

  it('silently ignores responses with no request metadata', async () => {
    const { player, captured } = makeMockPlayer5x();

    const controller = attachC2pa(player);
    const errorListener = vi.fn();
    controller.on('error', errorListener);

    const response: Dash5xResponse = { data: new Uint8Array([1]).buffer };
    const result = await captured.fn!(response);

    expect(result).toBe(response);
    expect(errorListener).not.toHaveBeenCalled();
  });
});

// ─── version detection ────────────────────────────────────────────────────────

describe('attachC2pa (version detection)', () => {
  it('throws when neither API is present on the player', () => {
    const player: DashjsPlayer = {};

    expect(() => attachC2pa(player)).toThrowError(
      '[@qualabs/c2pa-live-dashjs-plugin] Unsupported dash.js version',
    );
  });
});
