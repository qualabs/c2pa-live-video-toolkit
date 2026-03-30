import { Router } from 'express';
import http from 'http';
import { ORIGIN } from '../config.js';
import type { Application } from 'express';

export const router = Router();

router.get('/stream_with_ad.mpd', (_req, res) => {
  http
    .get(`${ORIGIN}/stream_with_ad.mpd`, (originRes) => {
      if (originRes.statusCode !== 200) {
        res.writeHead(originRes.statusCode ?? 502, originRes.headers);
        originRes.pipe(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/dash+xml' });
      originRes.pipe(res);
    })
    .on('error', (err) => {
      console.error('Failed to fetch stream_with_ad.mpd:', err.message);
      res.status(502).send('Bad Gateway');
    });
});

export function registerFallbackProxy(app: Application): void {
  app.use((req, res) => {
    http
      .get(`${ORIGIN}${req.path}`, (originRes) => {
        res.writeHead(originRes.statusCode ?? 502, originRes.headers);
        originRes.pipe(res);
      })
      .on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.status(502).send('Bad Gateway');
      });
  });
}
