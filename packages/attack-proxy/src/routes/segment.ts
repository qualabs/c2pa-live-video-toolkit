import { Router } from 'express';
import path from 'path';
import { state } from '../state.js';
import { parseSegmentFilename, proxySegment, buildSegmentPath, prefetchInBackground } from '../proxy/segment-proxy.js';
import { applyAttack } from '../attacks/index.js';
import { proxyGapEmptySegment } from '../attacks/gap.js';
import { proxyReplayAttack } from '../attacks/replay.js';
import { proxyReorderAttack } from '../attacks/out-of-order.js';
import { proxyWithContentSwap } from '../attacks/mdat-swap.js';

const router = Router();

function observeSegment(seg: number, streamId: string): void {
  if (state.lastSeenSegment !== seg) {
    state.observedSegments.push(seg);
    state.lastSeenSegment = seg;
    if (state.observedSegments.length > 20) state.observedSegments.shift();
  }
  if (state.lowestObservedStreamId === null || +streamId < +state.lowestObservedStreamId) {
    state.lowestObservedStreamId = streamId;
  }
}

router.get('*.m4s', async (req, res) => {
  if (req.path.includes('/ads/')) {
    return proxySegment(req, res, req.path, null);
  }

  const filename = path.basename(req.path);
  const info = parseSegmentFilename(filename);

  if (!info || filename.includes('stream1') || filename.includes('audio')) {
    return proxySegment(req, res, req.path, null);
  }

  observeSegment(info.number, info.streamId);
  const attack = applyAttack(state, info);
  const targetPath = buildSegmentPath(info, attack.targetSegment);

  if (attack.prefetchSegment != null) {
    void prefetchInBackground(attack.prefetchSegment, info);
  }

  if (attack.gapEmptySegment) return proxyGapEmptySegment(res, info, attack);
  if (attack.replayAttack) return proxyReplayAttack(req, res, info, attack);
  if (attack.reorderAttack) return proxyReorderAttack(req, res, info, attack);
  if (attack.swapMdat) return proxyWithContentSwap(req, res, targetPath, info.number);

  return proxySegment(req, res, targetPath, info.number);
});

export default router;
