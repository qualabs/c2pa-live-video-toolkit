import type { IStorage } from '../services/storage/IStorage.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/sleep.js';

const RETRY_DELAY_MS = 1000;

export class MpdFetcher {
  constructor(private readonly storage: IStorage) {}

  async fetchValidMpd(bucket: string, key: string): Promise<string> {
    for (;;) {
      try {
        const raw = await this.storage.getObjectAsString(bucket, key);
        if (this.isCompleteMpd(raw)) {
          return raw;
        }
        logger.warn('Incomplete MPD, retrying...');
      } catch (error) {
        this.handleFetchError(error, key);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  private isCompleteMpd(content: string): boolean {
    return !!(content && content.includes('<MPD') && content.includes('</MPD>'));
  }

  private handleFetchError(error: unknown, key: string): void {
    const err = error as Error & { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
      logger.error(`Access denied to MPD file: ${key}. Check your permissions.`);
      process.exit(1);
    } else if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      logger.warn('MPD not found, retrying...');
    } else {
      logger.error(`Error fetching MPD file: ${key}`, err);
    }
  }
}
