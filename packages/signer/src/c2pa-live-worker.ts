import { SegmentRepository } from './data/repository.js';
import { SegmentService } from './services/segment.js';
import { ManifestService } from './services/ManifestService.js';
import { StreamStateService } from './services/StreamStateService.js';
import { CleanupService } from './services/cleanup.js';
import { initializeCredentials } from './credentials.js';
import { loadC2paManifest } from './c2pa/manifest.js';
import { pollMpdAndHandle, startManifestPublisher } from './mpd/handler.js';
import { config } from './config.js';
import { TEMP_DIR, CURRENT_MANIFEST_PATH } from './constants.js';
import { logger } from './utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const PROCESSED_OUTPUT_SUBDIR = 'processed/output';

const segmentRepository = new SegmentRepository();
const segmentService = new SegmentService(segmentRepository);
const manifestService = new ManifestService(segmentRepository);
const streamStateService = new StreamStateService(segmentRepository);
const cleanupService = new CleanupService();

(async () => {
  // 0. Clean processed/output directory and session keys on startup
  logger.info('Cleaning processed output and session keys...');

  // Clean processed/output directory
  const processedOutputDir = path.join(config.outputBucket, PROCESSED_OUTPUT_SUBDIR);
  try {
    const files = await fs.readdir(processedOutputDir);
    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith('.m4s') || file.endsWith('.mp4')) {
        await fs.unlink(path.join(processedOutputDir, file));
        deletedCount++;
      }
    }
    logger.info(`Cleaned ${deletedCount} files from ${processedOutputDir}`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info(`Creating processed output directory: ${processedOutputDir}`);
      await fs.mkdir(processedOutputDir, { recursive: true });
    } else {
      logger.error('Failed to clean processed output directory:', error);
    }
  }

  // Clean session key files and cached init segments from /tmp
  try {
    const tmpFiles = await fs.readdir(TEMP_DIR);
    let deletedKeys = 0;
    let deletedInits = 0;
    for (const file of tmpFiles) {
      if (file.startsWith('session_key_') && file.endsWith('.pem')) {
        await fs.unlink(path.join(TEMP_DIR, file));
        deletedKeys++;
      } else if (file.startsWith('init_') && (file.endsWith('.mp4') || file.endsWith('.m4s'))) {
        await fs.unlink(path.join(TEMP_DIR, file));
        deletedInits++;
      } else if (file.startsWith('processed_init-') && file.endsWith('.m4s')) {
        await fs.unlink(path.join(TEMP_DIR, file));
        deletedInits++;
      }
    }
    if (deletedKeys > 0) {
      logger.info(`Cleaned ${deletedKeys} session key files from ${TEMP_DIR}`);
    }
    if (deletedInits > 0) {
      logger.info(`Cleaned ${deletedInits} cached init segments from ${TEMP_DIR}`);
    }
  } catch (error: unknown) {
    logger.error('Failed to clean /tmp files:', error);
  }

  // 1. Initialize credentials
  await initializeCredentials();

  // 2. Load C2PA Manifest
  await loadC2paManifest(CURRENT_MANIFEST_PATH);

  // 3. Initialize MPD Loop
  pollMpdAndHandle(segmentService, manifestService, streamStateService);

  // 4. Initialize the processed published manifests
  startManifestPublisher(manifestService, streamStateService);

  // 5. Initialize cleanup service for old processed segments
  cleanupService.start();
})();
