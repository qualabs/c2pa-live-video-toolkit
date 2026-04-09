import { validateC2paManifestBoxSegment } from '@svta/cml-c2pa';
import type { ManifestBoxValidationState } from '@svta/cml-c2pa';
import { ValidationErrorCode } from '../types.js';

export type ManifestBoxValidationResult = {
  isValid: boolean;
  sequenceNumber: number;
  bmffHashHex: string | null;
  manifest: unknown;
  issuer?: string | null;
  previousManifestId?: string | null;
  errorCodes?: readonly string[];
};

export class ManifestBoxValidator {
  private lastManifestId: string | null = null;
  private lastState: ManifestBoxValidationState | undefined = undefined;
  private isFirstSegment = true;

  async validate(bytes: Uint8Array, fallbackIndex: number): Promise<ManifestBoxValidationResult> {
    const wasFirstSegment = this.isFirstSegment;
    this.isFirstSegment = false;

    const { result, nextManifestId, nextState } = await validateC2paManifestBoxSegment(
      bytes,
      this.lastManifestId,
      this.lastState,
    );

    if (result.manifest != null) {
      this.lastManifestId = nextManifestId;
      this.lastState = nextState;
    }

    // The first media segment after init is signed without --previous-segment, so
    // c2patool does not embed previousManifestId. Suppress continuity-only failures
    // on the first segment — the chain proper starts from segment 2.
    let isValid = result.isValid;
    let errorCodes = result.errorCodes;
    if (!isValid && wasFirstSegment) {
      const nonContinuityErrors = (result.errorCodes ?? []).filter(
        (c) => c !== ValidationErrorCode.CONTINUITY_INVALID,
      );
      if (nonContinuityErrors.length === 0) {
        isValid = true;
        errorCodes = [];
      }
    }

    return {
      isValid,
      sequenceNumber: result.sequenceNumber ?? fallbackIndex,
      bmffHashHex: result.bmffHashHex,
      manifest: result.manifest,
      issuer: result.issuer,
      previousManifestId: result.previousManifestId,
      errorCodes,
    };
  }

  reset(): void {
    this.lastManifestId = null;
    this.lastState = undefined;
    this.isFirstSegment = true;
  }
}
