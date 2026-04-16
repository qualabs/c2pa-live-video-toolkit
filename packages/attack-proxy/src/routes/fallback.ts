import { Router } from 'express';
import { fetchFromOrigin } from '../proxy/fetchFromOrigin.js';
import { logger, errorMessage } from '../utils/logger.js';
import type { Application } from 'express';

export const router = Router();

router.get('/stream_with_ad.mpd', async (_req, res) => {
  try {
    const response = await fetchFromOrigin('/stream_with_ad.mpd');
    if (response.statusCode !== 200) {
      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/dash+xml' });
    res.end(response.body);
  } catch (err) {
    logger.error('Failed to fetch stream_with_ad.mpd:', errorMessage(err));
    res.status(502).send('Bad Gateway');
  }
});

export function registerFallbackProxy(app: Application): void {
  app.use(async (req, res) => {
    try {
      const response = await fetchFromOrigin(req.path);
      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
    } catch (err) {
      logger.error('Proxy error:', errorMessage(err));
      res.status(502).send('Bad Gateway');
    }
  });
}
