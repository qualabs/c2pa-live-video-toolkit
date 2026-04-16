import { Router } from 'express';
import { restartStreamerContainer } from '../docker/streamer-control.js';
import { resetState } from '../state.js';
import { logger, errorMessage } from '../utils/logger.js';

const router = Router();

router.post('/restart', async (_req, res) => {
  try {
    await restartStreamerContainer();
    resetState();
    logger.info('Streamer restarted, attack state reset');
    res.json({ ok: true });
  } catch (error) {
    const errorMsg = errorMessage(error);
    logger.error('Failed to restart streamer container:', errorMsg);
    res.status(500).json({
      ok: false,
      error: errorMsg,
      hint: 'Make sure the streamer service is running: docker compose up -d streamer',
    });
  }
});

export default router;
