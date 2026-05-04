import { Router } from 'express';
import { state } from '../state.js';
import { logger } from '../utils/logger.js';

const router = Router();

function resetGuards(): void {
  state.guards = { replay: false, gap: false, mdatSwap: false, reorder: false };
}

router.post('/gap', (_req, res) => {
  state.pendingGap = true;
  state.gapFiredStreams = new Set();
  // Pre-arm at the next segment so any in-flight segment finishes normally.
  state.gapFiredAtSegment = (state.lastSeenSegment ?? 0) + 1;
  state.gapFiredAtTimestamp = null;
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'gap' };
  resetGuards();
  logger.info('[GAP] Armed — will fire on next request from each stream');
  res.json({ ok: true });
});

router.post('/out-of-order', (_req, res) => {
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'out-of-order' };
  resetGuards();
  logger.info('Out-of-order attack armed');
  res.json({ ok: true });
});

router.post('/replay', (_req, res) => {
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'replay' };
  resetGuards();
  logger.info('Replay attack armed');
  res.json({ ok: true });
});

router.post('/mdat-swap', (_req, res) => {
  state.pendingMoofTamper = true;
  state.mdatAttackAt = null;
  state.attackConfig = { ...state.attackConfig, enabled: true, type: 'mdat-swap' };
  logger.info('Mdat-swap attack armed');
  res.json({ ok: true });
});

router.post('/disable', (_req, res) => {
  state.attackConfig.enabled = false;
  state.attackConfig.type = 'none';
  state.pendingGap = false;
  state.gapFiredStreams.clear();
  state.gapFiredAtSegment = null;
  state.gapFiredAtTimestamp = null;
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
