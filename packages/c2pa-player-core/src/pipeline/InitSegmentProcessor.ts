import { validateC2paInitSegment } from '@svta/cml-c2pa';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import { asValidationErrorCodes } from '../types.js';
import type { AugmentedC2paManifest, InitProcessedEvent, Logger } from '../types.js';
import { parseX509Names } from '../utils/x509.js';

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

      const certificate = (result as { certificate?: Uint8Array }).certificate;
      const augmentedManifest: AugmentedC2paManifest | null = result.manifest
        ? { ...result.manifest, certInfo: certificate ? parseX509Names(certificate) : null }
        : null;

      return {
        success: true,
        sessionKeysCount: result.sessionKeys.length,
        manifestId: result.manifestId ?? undefined,
        manifest: augmentedManifest,
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
        error: message,
      };
    }
  }
}
