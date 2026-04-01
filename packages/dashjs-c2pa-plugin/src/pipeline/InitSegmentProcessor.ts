import { validateC2paInitSegment } from '@svta/cml-c2pa';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { InitProcessedEvent, Logger } from '../types.js';

type InitSegmentProcessorDeps = {
  sessionKeyStore: SessionKeyStore;
  logger: Logger;
};

export class InitSegmentProcessor {
  private readonly sessionKeyStore: SessionKeyStore;
  private readonly logger: Logger;

  constructor({ sessionKeyStore, logger }: InitSegmentProcessorDeps) {
    this.sessionKeyStore = sessionKeyStore;
    this.logger = logger;
  }

  async process(bytes: Uint8Array): Promise<InitProcessedEvent> {
    try {
      const result = await validateC2paInitSegment(bytes);

      if (result.manifestId) {
        this.sessionKeyStore.setManifestId(new TextEncoder().encode(result.manifestId));
      }

      for (const key of result.sessionKeys) {
        this.sessionKeyStore.add(key);
      }

      this.logger.log(
        `[InitSegmentProcessor] Processed successfully — ${result.sessionKeys.length} session keys extracted`,
      );

      return {
        success: true,
        sessionKeysCount: result.sessionKeys.length,
        manifestId: result.manifestId ?? undefined,
        errorCodes: result.errorCodes,
      };
    } catch (error) {
      this.logger.error('[InitSegmentProcessor] Failed to process init segment:', error);
      return {
        success: false,
        sessionKeysCount: 0,
        manifestId: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
