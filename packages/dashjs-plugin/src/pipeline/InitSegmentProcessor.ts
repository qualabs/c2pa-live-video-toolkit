import { validateC2paInitSegment } from '@svta/cml-c2pa';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { InitProcessedEvent, ValidationErrorCode, Logger } from '../types.js';

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
        manifest: result.activeManifest ?? null,
        // CML returns string[] — cast to the known union of valid codes
        errorCodes: result.errorCodes as ValidationErrorCode[] | undefined,
      };
    } catch (error) {
      this.logger.error('[InitSegmentProcessor] Failed to process init segment:', error);
      return {
        success: false,
        sessionKeysCount: 0,
        manifestId: undefined,
        manifest: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
