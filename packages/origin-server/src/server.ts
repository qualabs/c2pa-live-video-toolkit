import express from 'express';
import cors from 'cors';
import fs from 'fs';
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
  if (req.path.endsWith('.mpd') || req.path.endsWith('.m3u8')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path.endsWith('.m4s')) {
    res.set('Cache-Control', 'public, max-age=3600, immutable');
  }
  next();
});

app.use(express.static(path.join(staticFilesRoot, 'processed', 'output')));
app.use('/ads', express.static(path.join(staticFilesRoot, 'processed', 'ads')));

// Dynamically build a CMAF HLS EVENT playlist from signed .m4s segments produced
// by the signer. Allows hls.js to consume the same segments as the DASH stream.
app.get('/stream.m3u8', (_req, res) => {
  const outputDir = path.join(staticFilesRoot, 'processed', 'output');
  let files: string[];
  try {
    files = fs.readdirSync(outputDir);
  } catch {
    res.status(503).send('Stream output not available');
    return;
  }

  const initSegment = files.find((f) => f.startsWith('init-stream') && f.endsWith('.m4s'));
  const mediaSegments = files
    .filter((f) => f.startsWith('chunk-stream') && f.endsWith('.m4s'))
    .sort();

  if (!initSegment || mediaSegments.length === 0) {
    res.status(503).send('No segments available yet — wait for the signer to produce output');
    return;
  }

  const targetDuration = 2;
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    '#EXT-X-PLAYLIST-TYPE:EVENT',
    `#EXT-X-MAP:URI="${initSegment}"`,
  ];
  for (const seg of mediaSegments) {
    lines.push(`#EXTINF:${targetDuration}.000,`);
    lines.push(seg);
  }
  lines.push('#EXT-X-ENDLIST');

  res.type('application/vnd.apple.mpegurl').send(lines.join('\n'));
});

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
