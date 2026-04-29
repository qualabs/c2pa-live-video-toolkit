import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { applyGapAttack } from './gap.js';
import { applyOutOfOrderAttack } from './out-of-order.js';
import { applyReplayAttack } from './replay.js';
import { applyMdatSwapAttack } from './mdat-swap.js';

export function applyAttack(session: SessionState, segment: SegmentInfo): AttackResult {
  const n = segment.number;
  const noAttack: AttackResult = { targetSegment: n, swapMdat: false };
  const { attackConfig } = session;

  if (attackConfig.type === 'gap') {
    const result = applyGapAttack(session, n, noAttack);
    if (result) return result;
  }

  if (!attackConfig.enabled || attackConfig.type === 'none') return noAttack;

  if (attackConfig.type === 'out-of-order') {
    return applyOutOfOrderAttack(session, n, noAttack) ?? noAttack;
  }
  if (attackConfig.type === 'replay') {
    return applyReplayAttack(session, n, noAttack) ?? noAttack;
  }
  if (attackConfig.type === 'mdat-swap' && session.pendingMoofTamper) {
    return applyMdatSwapAttack(session, n, segment.streamId) ?? noAttack;
  }

  return noAttack;
}
