import { Router } from 'express';
import { state } from '../state.js';

const router = Router();

function resetGuards(): void {
  state.guards = { replay: false, gap: false, mdatSwap: false, reorder: false };
}

router.post('/gap', (_req, res) => {
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'gap', gapAt: null };
  state.pendingGap = true;
  resetGuards();
  console.log('Gap attack armed');
  res.json({ ok: true });
});

router.post('/out-of-order', (_req, res) => {
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'out-of-order' };
  resetGuards();
  console.log('Out-of-order attack armed');
  res.json({ ok: true });
});

router.post('/replay', (_req, res) => {
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'replay' };
  resetGuards();
  console.log('Replay attack armed');
  res.json({ ok: true });
});

router.post('/mdat-swap', (_req, res) => {
  state.pendingMoofTamper = true;
  state.mdatAttackAt = null;
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'mdat-swap' };
  console.log('Mdat-swap attack armed');
  res.json({ ok: true });
});

router.post('/disable', (_req, res) => {
  state.attackConfig.enabled = false;
  state.attackConfig.type = 'none';
  state.pendingGap = false;
  resetGuards();
  res.json({ ok: true });
});

router.get('/status', (_req, res) => {
  res.json({
    config: state.attackConfig,
    guards: state.guards,
    observed: { lastSeen: state.lastSeenSegment, history: state.observedSegments.slice(-5) },
    contentCacheSize: state.contentCache.size,
  });
});

export default router;
