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
  private readonly merkleMaps: readonly MerkleMap[];
  private state: MerkleSegmentState | undefined;

  constructor(merkleMaps: readonly MerkleMap[]) {
    this.merkleMaps = merkleMaps;
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
