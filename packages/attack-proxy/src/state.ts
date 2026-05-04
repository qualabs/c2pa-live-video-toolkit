import type { SessionState, AttackConfig, AttackGuards } from './types.js';

function createEmptyAttackConfig(): AttackConfig {
  return {
    enabled: false,
    type: 'none',
    reorderSeg1: null,
    reorderSeg2: null,
    replaySegment: null,
    _attackSegment: null,
  };
}

function createEmptyGuards(): AttackGuards {
  return { replay: false, gap: false, mdatSwap: false, reorder: false };
}

function createEmptyState(): SessionState {
  return {
    attackConfig: createEmptyAttackConfig(),
    guards: createEmptyGuards(),
    lastSeenSegment: null,
    lowestObservedStreamId: null,
    pendingGap: false,
    gapFiredStreams: new Set(),
    gapFiredAtSegment: null,
    gapFiredAtTimestamp: null,
    pendingMoofTamper: false,
    mdatAttackAt: null,
    observedSegments: [],
    contentCache: new Map(),
  };
}

export let state: SessionState = createEmptyState();

export function resetState(): void {
  state = createEmptyState();
}
