export interface AttackConfig {
  enabled: boolean;
  type: 'none' | 'gap' | 'out-of-order' | 'replay' | 'mdat-swap';
  gapAt: number | null;
  reorderSeg1: number | null;
  reorderSeg2: number | null;
  replaySegment: number | null;
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
  pendingGap: boolean;
  pendingMoofTamper: boolean;
  mdatAttackAt: number | null;
  observedSegments: number[];
  contentCache: Map<number, CachedSegment>;
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
  reorderAttack?: boolean;
  serveContentOf?: number;
  asSlot?: number;
}
