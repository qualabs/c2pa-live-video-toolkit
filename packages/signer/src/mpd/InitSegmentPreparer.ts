import path from 'path';
import fs from 'fs/promises';
import { config } from '../config.js';
import { streamToBuffer } from '../utils/stream.js';
import { generateSessionKey } from '../c2pa/initSessionKeys.js';
import type { IStorage } from '../services/storage/IStorage.js';
import { TEMP_DIR, REPRESENTATION_ID_PLACEHOLDER } from '../constants.js';
import { logger } from '../utils/logger.js';

export class InitSegmentPreparer {
  constructor(private readonly storage: IStorage) {}

  async prepareForRepresentation(repId: string, initPattern: string | null): Promise<void> {
    logger.debug(`[init] copyInitSegmentsIfNeeded called for reps: ${repId}`);

    if (!initPattern) {
      logger.debug(`[init] Rep ${repId} has no initPattern, skipping`);
      return;
    }

    logger.debug(`[init] Rep ${repId} initPattern: ${initPattern}`);

    try {
      const initKey = initPattern.replace(REPRESENTATION_ID_PLACEHOLDER, repId);
      const outputKey = `processed/${initKey}`;

      if (await this.storage.objectExists(config.outputBucket, outputKey)) {
        logger.debug(`Signed init segment already exists: ${outputKey}, skipping.`);
        return;
      }

      await this.downloadAndCacheInit(repId, initKey);
    } catch (error) {
      logger.error(`Failed to process init segment for rep ${repId}:`, error);
      throw error;
    }
  }

  private async downloadAndCacheInit(repId: string, initKey: string): Promise<void> {
    logger.info(`Signing init segment for rep ${repId}: ${initKey}`);
    const tempPath = `${TEMP_DIR}/${path.basename(initKey)}`;

    await fs.unlink(tempPath).catch(() => {});

    const stream = await this.storage.getObject(config.inputBucket, initKey);
    const buffer = await streamToBuffer(stream);
    await fs.writeFile(tempPath, buffer);

    if (config.useVsiMethod) {
      const keyExists = await fs
        .access(config.vsiSessionKeyPath)
        .then(() => true)
        .catch(() => false);
      if (!keyExists) {
        await generateSessionKey(config.vsiSessionKeyPath);
        logger.info(`Session key generated at: ${config.vsiSessionKeyPath}`);
      } else {
        logger.debug(`Reusing existing session key at: ${config.vsiSessionKeyPath}`);
      }
    }

    logger.info(`Init segment cached at ${tempPath}. Will be signed with first media segment.`);
  }
}
