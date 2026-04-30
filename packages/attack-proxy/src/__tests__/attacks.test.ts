import { describe, it, expect } from 'vitest';
import { applyGapAttack } from '../attacks/gap.js';
import { applyOutOfOrderAttack } from '../attacks/out-of-order.js';
import { applyReplayAttack } from '../attacks/replay.js';
import { applyMdatSwapAttack } from '../attacks/mdat-swap.js';
import { applyAttack } from '../attacks/index.js';
import type { SessionState, AttackResult } from '../types.js';

function createSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    attackConfig: {
      enabled: false,
      type: 'none',
      gapAt: null,
      reorderSeg1: null,
      reorderSeg2: null,
      replaySegment: null,
      _attackSegment: null,
    },
    guards: { replay: false, gap: false, mdatSwap: false, reorder: false },
    lastSeenSegment: null,
    lowestObservedStreamId: null,
    pendingGap: false,
    pendingMoofTamper: false,
    mdatAttackAt: null,
    observedSegments: [],
    contentCache: new Map(),
    ...overrides,
  };
}

const NO_ATTACK: AttackResult = { targetSegment: 5, swapMdat: false };

describe('applyGapAttack', () => {
  it('arms gap at next segment when pendingGap is true and lastSeen is set', () => {
    const session = createSession({
      pendingGap: true,
      lastSeenSegment: 10,
      attackConfig: { ...createSession().attackConfig, type: 'gap', enabled: true },
    });

    applyGapAttack(session, 11, NO_ATTACK);

    expect(session.attackConfig.gapAt).toBe(11);
    expect(session.pendingGap).toBe(false);
  });

  it('returns gap result when segment matches gapAt', () => {
    const session = createSession({
      attackConfig: { ...createSession().attackConfig, type: 'gap', enabled: true, gapAt: 5 },
    });

    const result = applyGapAttack(session, 5, NO_ATTACK);

    expect(result).not.toBeNull();
    expect(result!.gapEmptySegment).toBe(true);
    expect(result!.gapAt).toBe(5);
  });

  it('returns null when segment does not match gapAt', () => {
    const session = createSession({
      attackConfig: { ...createSession().attackConfig, type: 'gap', gapAt: 10 },
    });

    expect(applyGapAttack(session, 5, NO_ATTACK)).toBeNull();
  });
});

describe('applyOutOfOrderAttack', () => {
  it('arms the reorder on first call', () => {
    const session = createSession({
      attackConfig: { ...createSession().attackConfig, type: 'out-of-order', enabled: true },
    });

    const result = applyOutOfOrderAttack(session, 5, NO_ATTACK);

    expect(result).toEqual({ ...NO_ATTACK, prefetchSegment: 7 });
    expect(session.guards.reorder).toBe(true);
    expect(session.attackConfig.reorderSeg1).toBe(6);
    expect(session.attackConfig.reorderSeg2).toBe(7);
  });

  it('returns reorder result for seg1', () => {
    const session = createSession({
      attackConfig: {
        ...createSession().attackConfig,
        type: 'out-of-order',
        enabled: true,
        reorderSeg1: 6,
        reorderSeg2: 7,
      },
      guards: { ...createSession().guards, reorder: true },
    });

    const result = applyOutOfOrderAttack(session, 6, NO_ATTACK);

    expect(result!.reorderAttack).toBe(true);
    expect(result!.serveContentOf).toBe(7);
    expect(result!.asSlot).toBe(6);
  });

  it('disables attack after serving seg2', () => {
    const session = createSession({
      attackConfig: {
        ...createSession().attackConfig,
        type: 'out-of-order',
        enabled: true,
        reorderSeg1: 6,
        reorderSeg2: 7,
      },
      guards: { ...createSession().guards, reorder: true },
    });

    applyOutOfOrderAttack(session, 7, NO_ATTACK);

    expect(session.attackConfig.enabled).toBe(false);
  });
});

describe('applyReplayAttack', () => {
  it('arms the replay when content cache has the previous segment', () => {
    const contentCache = new Map();
    contentCache.set(4, { moof: Buffer.alloc(0), mdat: Buffer.alloc(0), full: Buffer.alloc(0) });

    const session = createSession({
      attackConfig: { ...createSession().attackConfig, type: 'replay', enabled: true },
      contentCache,
    });

    const result = applyReplayAttack(session, 5, NO_ATTACK);

    expect(result).toEqual(NO_ATTACK);
    expect(session.guards.replay).toBe(true);
    expect(session.attackConfig.replaySegment).toBe(4);
    expect(session.attackConfig._attackSegment).toBe(6);
  });

  it('returns replay result on the attack segment', () => {
    const contentCache = new Map();
    contentCache.set(4, { moof: Buffer.alloc(0), mdat: Buffer.alloc(0), full: Buffer.alloc(0) });

    const session = createSession({
      attackConfig: {
        ...createSession().attackConfig,
        type: 'replay',
        enabled: true,
        replaySegment: 4,
        _attackSegment: 6,
      },
      guards: { ...createSession().guards, replay: true },
      contentCache,
    });

    const result = applyReplayAttack(session, 6, NO_ATTACK);

    expect(result!.replayAttack).toBe(true);
    expect(result!.replayFrom).toBe(4);
    expect(result!.slotNumber).toBe(6);
  });
});

describe('applyMdatSwapAttack', () => {
  it('sets mdatAttackAt to next segment and waits for it', () => {
    const session = createSession({
      lastSeenSegment: 10,
      pendingMoofTamper: true,
    });

    // Segment 9 arrives first — arms the attack for segment 11 but doesn't trigger
    const result = applyMdatSwapAttack(session, 9, '0');

    expect(session.mdatAttackAt).toBe(11);
    expect(result).toBeNull();
  });

  it('returns swap result and disables when segment matches', () => {
    const session = createSession({
      mdatAttackAt: 5,
      pendingMoofTamper: true,
      attackConfig: { ...createSession().attackConfig, type: 'mdat-swap', enabled: true },
    });

    const result = applyMdatSwapAttack(session, 5, '0');

    expect(result).not.toBeNull();
    expect(result!.swapMdat).toBe(true);
    expect(session.attackConfig.enabled).toBe(false);
    expect(session.pendingMoofTamper).toBe(false);
  });

  it('returns null when segment does not match', () => {
    const session = createSession({ mdatAttackAt: 10 });

    expect(applyMdatSwapAttack(session, 5, '0')).toBeNull();
  });
});

describe('applyAttack (dispatcher)', () => {
  it('returns no-attack when attacks are disabled', () => {
    const session = createSession();
    const segment = { streamId: '0', number: 5, pattern: 'chunk-stream' };

    const result = applyAttack(session, segment);

    expect(result.swapMdat).toBe(false);
    expect(result.targetSegment).toBe(5);
  });

  it('dispatches gap attack when type is gap', () => {
    const session = createSession({
      attackConfig: { ...createSession().attackConfig, type: 'gap', enabled: true, gapAt: 5 },
    });

    const result = applyAttack(session, { streamId: '0', number: 5, pattern: 'chunk-stream' });

    expect(result.gapEmptySegment).toBe(true);
  });
});
