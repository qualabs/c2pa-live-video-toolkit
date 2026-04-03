import { Router } from 'express';

const router = Router();

function resetGuards(session: Express.Request['session']): void {
  session.guards = { replay: false, gap: false, mdatSwap: false, reorder: false };
}

router.post('/gap', (req, res) => {
  const { session, userId } = req;
  session.attackConfig = { ...session.attackConfig, enabled: true, type: 'gap', gapAt: null };
  session.pendingGap = true;
  resetGuards(session);
  console.log(`Gap attack armed [session ${userId}]`);
  res.json({ ok: true });
});

router.post('/out-of-order', (req, res) => {
  const { session, userId } = req;
  session.attackConfig = { ...session.attackConfig, enabled: true, type: 'out-of-order' };
  resetGuards(session);
  console.log(`Out-of-order attack armed [session ${userId}]`);
  res.json({ ok: true });
});

router.post('/replay', (req, res) => {
  const { session, userId } = req;
  session.attackConfig = { ...session.attackConfig, enabled: true, type: 'replay' };
  resetGuards(session);
  console.log(`Replay attack armed [session ${userId}]`);
  res.json({ ok: true });
});

router.post('/mdat-swap', (req, res) => {
  const { session, userId } = req;
  session.pendingMoofTamper = true;
  session.mdatAttackAt = null;
  session.attackConfig = { ...session.attackConfig, enabled: true, type: 'mdat-swap' };
  console.log(`Mdat-swap attack armed [session ${userId}]`);
  res.json({ ok: true });
});

router.post('/disable', (req, res) => {
  const { session } = req;
  session.attackConfig.enabled = false;
  session.attackConfig.type = 'none';
  session.pendingGap = false;
  resetGuards(session);
  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const { session } = req;
  res.json({
    config: session.attackConfig,
    guards: session.guards,
    observed: { lastSeen: session.lastSeenSegment, history: session.observedSegments.slice(-5) },
    contentCacheSize: session.contentCache.size,
  });
});

export default router;
