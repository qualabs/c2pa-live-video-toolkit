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
    const result = applyGapAttack(session, segment.streamId, n, noAttack);
    if (result) return result;
  }

  if (!attackConfig.enabled || attackConfig.type === 'none') {
    // After the primary stream fires (enabled=false), secondary streams (audio) may arrive at the
    // same attack slot slightly later. Let them fire too.
    if (
      attackConfig.type === 'replay' &&
      attackConfig._attackSegment !== null &&
      n === attackConfig._attackSegment &&
      segment.streamId !== attackConfig.replayStreamId
    ) {
      return applyReplayAttack(session, n, segment.streamId, noAttack) ?? noAttack;
    }
    if (
      attackConfig.type === 'out-of-order' &&
      attackConfig.reorderSeg1 !== null &&
      (n === attackConfig.reorderSeg1 || n === attackConfig.reorderSeg2)
    ) {
      return applyOutOfOrderAttack(session, n, noAttack) ?? noAttack;
    }
    return noAttack;
  }

  if (attackConfig.type === 'out-of-order') {
    return applyOutOfOrderAttack(session, n, noAttack) ?? noAttack;
  }
  if (attackConfig.type === 'replay') {
    return applyReplayAttack(session, n, segment.streamId, noAttack) ?? noAttack;
  }
  if (attackConfig.type === 'mdat-swap' && session.pendingMoofTamper) {
    return applyMdatSwapAttack(session, n, segment.streamId) ?? noAttack;
  }

  return noAttack;
}
