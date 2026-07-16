import { validateC2paMerkleSegment } from '@svta/cml-c2pa';
import type { MerkleMap, MerkleSegmentState } from '@svta/cml-c2pa';

export type MerkleValidationResult = {
  isValid: boolean;
  location: number | null;
  bmffHashHex: string | null;
  errorCodes?: readonly string[];
};

/**
 * Per-segment validator for VOD Merkle mode (C2PA §15.12.2.2). Holds the merkle
 * maps and the location-continuity state; crypto is delegated to CML.
 */
export class MerkleValidator {
  private merkleMaps: readonly MerkleMap[];
  private state: MerkleSegmentState | undefined;

  constructor(merkleMaps: readonly MerkleMap[]) {
    this.merkleMaps = merkleMaps;
  }

  /**
   * Adopts maps from a re-delivered init (e.g. quality switch) keeping the
   * continuity state. Returns false when the tracks differ structurally.
   */
  adoptMerkleMaps(merkleMaps: readonly MerkleMap[]): boolean {
    const sameTracks =
      merkleMaps.length === this.merkleMaps.length &&
      merkleMaps.every((next) =>
        this.merkleMaps.some(
          (prev) =>
            prev.uniqueId === next.uniqueId &&
            prev.localId === next.localId &&
            prev.count === next.count,
        ),
      );
    if (!sameTracks) return false;
    this.merkleMaps = merkleMaps;
    return true;
  }

  async validate(segmentBytes: Uint8Array): Promise<MerkleValidationResult | null> {
    const validated = await validateC2paMerkleSegment(segmentBytes, this.merkleMaps, this.state);
    if (!validated) return null;

    this.state = validated.nextState;
    const { result } = validated;
    return {
      isValid: result.isValid,
      location: result.location,
      bmffHashHex: result.bmffHashHex,
      errorCodes: result.errorCodes,
    };
  }
}
