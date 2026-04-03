import { Router } from 'express';
import { restartStreamerContainer } from '../docker/streamer-control.js';
import { clearAllSessions } from '../middleware/session.js';

const router = Router();

router.post('/restart', async (_req, res) => {
  try {
    await restartStreamerContainer();
    clearAllSessions();
    console.log('Streamer restarted, all session state cleared');
    res.json({ ok: true });
  } catch (error) {
    const errorMsg = (error as Error).message ?? 'Unknown error';
    console.error('Failed to restart streamer container:', errorMsg);
    res.status(500).json({
      ok: false,
      error: errorMsg,
      hint: 'Make sure the streamer service is running: docker compose up -d streamer',
    });
  }
});

export default router;
