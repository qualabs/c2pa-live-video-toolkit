import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';
import { sessionMiddleware } from './middleware/session.js';
import attackRouter from './routes/attack.js';
import segmentRouter from './routes/segment.js';
import streamerRouter from './routes/streamer.js';
import { router as manifestRouter, registerFallbackProxy } from './routes/fallback.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(sessionMiddleware);

app.use('/attack', attackRouter);
app.use('/streamer', streamerRouter);
app.use(manifestRouter);
app.use(segmentRouter);
registerFallbackProxy(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Attack proxy running on http://0.0.0.0:${PORT}`);
});
