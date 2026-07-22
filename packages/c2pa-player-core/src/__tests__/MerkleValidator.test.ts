import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MerkleValidator } from '../pipeline/MerkleValidator.js';
import type { MerkleMap } from '@svta/cml-c2pa';

vi.mock('@svta/cml-c2pa', () => ({
  validateC2paMerkleSegment: vi.fn(),
}));

import { validateC2paMerkleSegment } from '@svta/cml-c2pa';
const mockValidate = vi.mocked(validateC2paMerkleSegment);

const MERKLE_MAPS: MerkleMap[] = [
  {
    uniqueId: 1,
    localId: 1,
    count: 3,
    hashes: [new Uint8Array(32)],
    initHash: null,
    alg: 'SHA-256',
    exclusions: [],
    offsetPrefixSize: 8,
  },
];

function cmlResult(isValid: boolean, location: number | null, errorCodes: string[] = []) {
  return {
    result: { isValid, location, bmffHashHex: 'leaf-hash-hex', errorCodes },
    nextState: { lastLocation: new Map([['1:1', location ?? 0]]) },
  } as never;
}

describe('MerkleValidator', () => {
  let validator: MerkleValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new MerkleValidator(MERKLE_MAPS);
  });

  it('maps a valid CML result', async () => {
    mockValidate.mockResolvedValue(cmlResult(true, 0));

    const result = await validator.validate(new Uint8Array([0x00]));

    expect(result).toEqual({
      isValid: true,
      location: 0,
      bmffHashHex: 'leaf-hash-hex',
      errorCodes: [],
    });
  });

  it('maps an invalid CML result with its error codes', async () => {
    mockValidate.mockResolvedValue(cmlResult(false, 1, ['assertion.bmffHash.mismatch']));

    const result = await validator.validate(new Uint8Array([0x00]));

    expect(result?.isValid).toBe(false);
    expect(result?.errorCodes).toContain('assertion.bmffHash.mismatch');
  });

  it('returns null when CML reports no Merkle mode', async () => {
    mockValidate.mockResolvedValue(null as never);

    expect(await validator.validate(new Uint8Array([0x00]))).toBeNull();
  });

  it('carries state forward between calls', async () => {
    mockValidate.mockResolvedValue(cmlResult(true, 0));
    await validator.validate(new Uint8Array([0x00]));
    await validator.validate(new Uint8Array([0x01]));

    expect(mockValidate.mock.calls[0][2]).toBeUndefined();
    expect(mockValidate.mock.calls[1][2]).toEqual({ lastLocation: new Map([['1:1', 0]]) });
  });
});
