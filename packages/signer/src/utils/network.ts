import { config } from '../config.js';
import { createStorage } from '../services/storage/storageFactory.js';
import { logger } from './logger.js';
import { sleep } from './sleep.js';

const DEFAULT_POLL_DELAY_MS = 1000;

const storage = createStorage();

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
