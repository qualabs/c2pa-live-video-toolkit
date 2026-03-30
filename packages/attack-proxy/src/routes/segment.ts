import { Router } from 'express';
import path from 'path';
import { parseSegmentFilename, proxySegment, buildSegmentPath } from '../proxy/segment-proxy.js';
import { applyAttack } from '../attacks/index.js';
import { proxyGapEmptySegment } from '../attacks/gap.js';
import { proxyReplayAttack } from '../attacks/replay.js';
import { proxyReorderAttack } from '../attacks/out-of-order.js';
import { proxyWithContentSwap } from '../attacks/mdat-swap.js';

const router = Router();

function observeSegment(session: Express.Request['session'], seg: number): void {
  if (session.lastSeenSegment !== seg) {
    session.observedSegments.push(seg);
    session.lastSeenSegment = seg;
    if (session.observedSegments.length > 20) session.observedSegments.shift();
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

  observeSegment(req.session, info.number);
  const attack = applyAttack(req.session, info);
  const targetPath = buildSegmentPath(info, attack.targetSegment);

  if (attack.gapEmptySegment) return proxyGapEmptySegment(res, info, attack);
  if (attack.replayAttack) return proxyReplayAttack(req, res, info, attack);
  if (attack.reorderAttack) return proxyReorderAttack(req, res, info, attack);
  if (attack.swapMdat) return proxyWithContentSwap(req, res, targetPath, info.number);

  return proxySegment(req, res, targetPath, info.number);
});

export default router;
