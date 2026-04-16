import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VsiValidator } from '../pipeline/VsiValidator.js';
import { SessionKeyStore } from '../state/SessionKeyStore.js';
import { SequenceTracker } from '../state/SequenceTracker.js';
import type { ValidatedSessionKey } from '@svta/cml-c2pa';

vi.mock('@svta/cml-c2pa', () => ({
  validateC2paSegment: vi.fn(),
}));

import { validateC2paSegment } from '@svta/cml-c2pa';
const mockValidate = vi.mocked(validateC2paSegment);

function makeKey(kid: string): ValidatedSessionKey {
  return { kid } as unknown as ValidatedSessionKey;
}

function makeCmlResult(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      isValid: true,
      bmffHashHex: 'hash-abc',
      kidHex: 'kid-1',
      manifestId: 'manifest-1',
      sequenceNumber: 1,
      sequenceResult: {
        isValid: true,
        reason: null,
      },
      ...overrides,
    },
    nextSequenceState: { lastSequenceNumber: 1 },
  };
}

describe('VsiValidator', () => {
  let validator: VsiValidator;
  let sessionKeyStore: SessionKeyStore;
  let sequenceTracker: SequenceTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionKeyStore = new SessionKeyStore();
    sessionKeyStore.add(makeKey('kid-1'));
    sequenceTracker = new SequenceTracker();
    validator = new VsiValidator({ sessionKeyStore, sequenceTracker });
  });

  it('returns null when CML returns null (no EMSG box)', async () => {
    mockValidate.mockResolvedValue(null as never);

    const result = await validator.validate(new Uint8Array([0x00]), 'video-rep1');

    expect(result).toBeNull();
  });

  it('returns valid result when CML validation succeeds', async () => {
    mockValidate.mockResolvedValue(makeCmlResult() as never);

    const result = await validator.validate(new Uint8Array([0x00]), 'video-rep1');

    expect(result).not.toBeNull();
    expect(result!.isValid).toBe(true);
    expect(result!.overall).toBe(true);
    expect(result!.sequenceNumber).toBe(1);
    expect(result!.bmffHashHex).toBe('hash-abc');
  });

  it('sets overall to false when sequence validation fails', async () => {
    mockValidate.mockResolvedValue(
      makeCmlResult({
        sequenceResult: { isValid: false, reason: 'duplicate' },
      }) as never,
    );

    const result = await validator.validate(new Uint8Array([0x00]), 'video-rep1');

    expect(result!.overall).toBe(false);
    expect(result!.sequenceReason).toBe('duplicate');
  });

  it('extracts missingFrom/missingTo on gap_detected', async () => {
    mockValidate.mockResolvedValue(
      makeCmlResult({
        sequenceResult: {
          isValid: false,
          reason: 'gap_detected',
          missingFrom: 2,
          missingTo: 4,
        },
      }) as never,
    );

    const result = await validator.validate(new Uint8Array([0x00]), 'video-rep1');

    expect(result!.sequenceReason).toBe('gap_detected');
    expect(result!.sequenceMissingFrom).toBe(2);
    expect(result!.sequenceMissingTo).toBe(4);
  });

  it('updates the sequence tracker state after validation', async () => {
    mockValidate.mockResolvedValue(makeCmlResult() as never);

    await validator.validate(new Uint8Array([0x00]), 'video-rep1');

    const state = sequenceTracker.getState('video-rep1');
    expect(state).toEqual({ lastSequenceNumber: 1 });
  });

  it('passes current sequence state to CML', async () => {
    const existingState = { lastSequenceNumber: 5 };
    sequenceTracker.setState('video-rep1', existingState as never);
    mockValidate.mockResolvedValue(makeCmlResult() as never);

    await validator.validate(new Uint8Array([0x00]), 'video-rep1');

    expect(mockValidate).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Array),
      existingState,
    );
  });
});
