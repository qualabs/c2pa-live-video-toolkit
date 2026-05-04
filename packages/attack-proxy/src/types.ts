export interface AttackConfig {
  enabled: boolean;
  type: 'none' | 'gap' | 'out-of-order' | 'replay' | 'mdat-swap';
  reorderSeg1: number | null;
  reorderSeg2: number | null;
  replaySegment: number | null;
  replayStreamId: string | null;
  _attackSegment: number | null;
}

export interface AttackGuards {
  replay: boolean;
  gap: boolean;
  mdatSwap: boolean;
  reorder: boolean;
}

export interface CachedSegment {
  moof: Buffer;
  mdat: Buffer;
  full: Buffer;
}

export interface SessionState {
  attackConfig: AttackConfig;
  guards: AttackGuards;
  lastSeenSegment: number | null;
  lowestObservedStreamId: string | null;
  pendingGap: boolean;
  gapFiredStreams: Set<string>;
  gapFiredAtSegment: number | null;
  gapFiredAtTimestamp: number | null;
  pendingMoofTamper: boolean;
  mdatAttackAt: number | null;
  observedSegments: number[];
  contentCache: Map<string, CachedSegment>;
}

export interface SegmentInfo {
  streamId: string;
  number: number;
  pattern: string;
}

export interface AttackResult {
  targetSegment: number;
  swapMdat: boolean;
  gapEmptySegment?: boolean;
  gapAt?: number;
  replayAttack?: boolean;
  replayFrom?: number;
  slotNumber?: number;
  replayIsPrimary?: boolean;
  reorderAttack?: boolean;
  serveContentOf?: number;
  asSlot?: number;
  prefetchSegment?: number;
}
