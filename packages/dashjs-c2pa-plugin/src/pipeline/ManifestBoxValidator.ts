import { validateC2paManifestBoxSegment } from '@svta/cml-c2pa';
import type { ManifestBoxValidationState } from '@svta/cml-c2pa';

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

  async validate(bytes: Uint8Array, fallbackIndex: number): Promise<ManifestBoxValidationResult> {
    const { result, nextManifestId, nextState } = await validateC2paManifestBoxSegment(
      bytes,
      this.lastManifestId,
      this.lastState,
    );

    this.lastManifestId = nextManifestId;
    this.lastState = nextState;

    return {
      isValid: result.isValid,
      sequenceNumber: result.sequenceNumber ?? fallbackIndex,
      bmffHashHex: result.bmffHashHex,
      manifest: result.manifest,
      issuer: result.issuer,
      previousManifestId: result.previousManifestId,
      errorCodes: result.errorCodes,
    };
  }

  reset(): void {
    this.lastManifestId = null;
    this.lastState = undefined;
  }
}
