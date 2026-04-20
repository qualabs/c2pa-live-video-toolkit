import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
const DEFAULT_PORT = 8081;
const PORT = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticFilesRoot =
  process.env.STATIC_FILES_PATH ?? path.join(currentDir, '..', 'live-streaming');

app.use(cors());

app.use((req, res, next) => {
  if (req.path.endsWith('.mpd')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path.endsWith('.m4s')) {
    res.set('Cache-Control', 'public, max-age=3600, immutable');
  }
  next();
});

app.use(express.static(path.join(staticFilesRoot, 'processed', 'output')));
app.use('/ads', express.static(path.join(staticFilesRoot, 'processed', 'ads')));

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

// UTC timing source advertised by the MPD's <UTCTiming> element. Clients sync their
// wall clock against this to locate the live edge without drifting vs. availabilityStartTime.
app.get('/time', (_req, res) => {
  res.type('text/plain').send(new Date().toISOString());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Origin server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving files from: ${path.join(staticFilesRoot, 'processed', 'output')}`);
});
