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

app.use(express.static(path.join(staticFilesRoot, 'processed', 'output')));
app.use('/ads', express.static(path.join(staticFilesRoot, 'processed', 'ads')));

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Origin server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving files from: ${path.join(staticFilesRoot, 'processed', 'output')}`);
});
