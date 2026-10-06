import { validateC2paInitSegment } from '@svta/cml-c2pa';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import { asValidationErrorCodes, ValidationErrorCode } from '../types.js';
import type { InitProcessedEvent, Logger } from '../types.js';

// A ManifestBox init carries no session keys and no merkle maps, so CML reports
// SESSION_KEY_INVALID for it; its media segments carry their own manifests.
function passesInitValidation(errorCodes: readonly string[]): boolean {
  return errorCodes.every((code) => code === ValidationErrorCode.SESSION_KEY_INVALID);
}

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

      if (!passesInitValidation(result.errorCodes)) {
        const message = `Init segment failed validation: ${result.errorCodes.join(', ')}`;
        this.logger.warn(`[InitSegmentProcessor] ${message}`);
        return {
          success: false,
          sessionKeysCount: 0,
          manifestId: result.manifestId ?? undefined,
          manifest: result.manifest ?? null,
          merkleMaps: [],
          errorCodes: asValidationErrorCodes(result.errorCodes),
          error: message,
        };
      }

      for (const key of result.sessionKeys) {
        this.sessionKeyStore.add(key);
      }

      this.logger.log(
        `[InitSegmentProcessor] Processed successfully — ${result.sessionKeys.length} session keys, ${result.merkleMaps?.length ?? 0} merkle maps extracted`,
      );

      return {
        success: true,
        sessionKeysCount: result.sessionKeys.length,
        manifestId: result.manifestId ?? undefined,
        manifest: result.manifest ?? null,
        merkleMaps: result.merkleMaps ?? [],
        errorCodes: asValidationErrorCodes(result.errorCodes),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const noC2paData = /no c2pa/i.test(message) || /uuid box/i.test(message);
      if (!noC2paData) {
        this.logger.error('[InitSegmentProcessor] Failed to process init segment:', error);
      }
      return {
        success: false,
        noC2paData,
        sessionKeysCount: 0,
        manifestId: undefined,
        manifest: null,
        merkleMaps: [],
        error: message,
      };
    }
  }
}
