import fsp from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const MS_PER_MINUTE = 60 * 1000;
const SEGMENT_FILE_PREFIX = 'chunk-stream';

export class CleanupService {
  private intervalId: NodeJS.Timeout | null = null;

  start(): void {
    if (this.intervalId) {
      logger.warn('Cleanup service already running');
      return;
    }

    logger.info(
      `Starting cleanup service (maxAge=${config.cleanupMaxAgeMinutes}min, interval=${config.cleanupIntervalMs}ms)`,
    );

    this.cleanOldSegments();

    this.intervalId = setInterval(() => {
      this.cleanOldSegments();
    }, config.cleanupIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Cleanup service stopped');
    }
  }

  async cleanOldSegments(): Promise<void> {
    const processedDir = path.resolve(config.outputBucket, 'processed/output');
    const maxAgeMs = config.cleanupMaxAgeMinutes * MS_PER_MINUTE;
    const now = Date.now();

    try {
      await this.cleanDirectory(processedDir, maxAgeMs, now);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug(`[cleanup] Directory does not exist yet: ${processedDir}`);
        return;
      }
      logger.error('[cleanup] Error during cleanup:', error);
    }
  }

  private async cleanDirectory(dir: string, maxAgeMs: number, now: number): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    let deletedCount = 0;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.cleanDirectory(fullPath, maxAgeMs, now);
      } else if (entry.isFile() && entry.name.startsWith(SEGMENT_FILE_PREFIX)) {
        try {
          const stats = await fsp.stat(fullPath);
          const age = now - stats.mtimeMs;

          if (age > maxAgeMs) {
            await fsp.unlink(fullPath);
            deletedCount++;
            logger.debug(`[cleanup] Deleted old segment: ${fullPath} (age: ${Math.round(age / MS_PER_MINUTE)}min)`);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.error(`[cleanup] Error processing file ${fullPath}:`, error);
          }
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`[cleanup] Deleted ${deletedCount} old segment(s) from ${dir}`);
    }
  }
}
