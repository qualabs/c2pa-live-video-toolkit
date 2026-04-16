import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';
import attackRouter from './routes/attack.js';
import segmentRouter from './routes/segment.js';
import streamerRouter from './routes/streamer.js';
import { router as manifestRouter, registerFallbackProxy } from './routes/fallback.js';
import { logger } from './utils/logger.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/attack', attackRouter);
app.use('/streamer', streamerRouter);
app.use(manifestRouter);
app.use(segmentRouter);
registerFallbackProxy(app);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Attack proxy running on http://0.0.0.0:${PORT}`);
});
