import { validateC2paMerkleSegment } from '@svta/cml-c2pa';
import type { MerkleMap, MerkleSegmentState } from '@svta/cml-c2pa';

export type MerkleValidationResult = {
  isValid: boolean;
  /** Zero-based leaf index of the segment in the Merkle tree, or null if malformed */
  location: number | null;
  /** Hex of the computed leaf hash (first track), or null if no track was hashed */
  bmffHashHex: string | null;
  errorCodes?: readonly string[];
};

/**
 * Stateful per-segment validator for VOD Merkle mode (C2PA §15.12.2.2).
 *
 * Holds the merkle maps extracted from the init segment and the
 * location-continuity state between segments. All cryptographic work is
 * delegated to CML's `validateC2paMerkleSegment`.
 */
export class MerkleValidator {
  private merkleMaps: readonly MerkleMap[];
  private state: MerkleSegmentState | undefined;

  constructor(merkleMaps: readonly MerkleMap[]) {
    this.merkleMaps = merkleMaps;
  }

  /**
   * Adopts the merkle maps from a re-delivered init segment while preserving
   * the location-continuity state, provided they describe the same tracks
   * (same uniqueId/localId/count — e.g. a quality switch within the same
   * content period). Returns false when the maps differ structurally; the
   * caller must create a fresh validator instead.
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
