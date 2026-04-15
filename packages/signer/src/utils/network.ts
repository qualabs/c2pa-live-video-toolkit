import { config } from '../config.js';
import { createStorage } from '../services/storage/storageFactory.js';
import { logger } from './logger.js';

const DEFAULT_POLL_DELAY_MS = 1000;

const storage = createStorage();

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSegmentInBucket(
  key: string,
  delayMs = DEFAULT_POLL_DELAY_MS,
): Promise<void> {
  for (;;) {
    try {
      logger.debug(`[prefetch] Checking for segment ${key} in storage...`);
      await storage.headObject(config.inputBucket, key);
      return;
    } catch (err) {
      logger.debug(`[prefetch] Segment ${key} not found, retrying in ${delayMs} ms...`, err);
      await sleep(delayMs);
    }
  }
}
