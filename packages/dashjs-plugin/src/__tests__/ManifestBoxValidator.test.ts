import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestBoxValidator } from '../pipeline/ManifestBoxValidator.js';

vi.mock('@svta/cml-c2pa', () => ({
  validateC2paManifestBoxSegment: vi.fn(),
}));

import { validateC2paManifestBoxSegment } from '@svta/cml-c2pa';
const mockValidate = vi.mocked(validateC2paManifestBoxSegment);

function makeCmlResult(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      isValid: true,
      sequenceNumber: 1,
      bmffHashHex: 'hash-abc',
      manifest: { label: 'test-manifest' },
      issuer: 'test-issuer',
      previousManifestId: null,
      errorCodes: [],
      ...overrides,
    },
    nextManifestId: 'urn:c2pa:manifest-1',
    nextState: {},
  };
}

describe('ManifestBoxValidator', () => {
  let validator: ManifestBoxValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new ManifestBoxValidator();
  });

  it('returns valid result when CML validation passes', async () => {
    mockValidate.mockResolvedValue(makeCmlResult() as never);

    const result = await validator.validate(new Uint8Array([0x00]), 1);

    expect(result.isValid).toBe(true);
    expect(result.sequenceNumber).toBe(1);
    expect(result.bmffHashHex).toBe('hash-abc');
  });

  it('returns the manifest from CML', async () => {
    mockValidate.mockResolvedValue(makeCmlResult() as never);

    const result = await validator.validate(new Uint8Array([0x00]), 1);

    expect(result.manifest).toEqual({ label: 'test-manifest' });
  });

  it('suppresses continuity-only failures on the first segment', async () => {
    mockValidate.mockResolvedValue(
      makeCmlResult({
        isValid: false,
        errorCodes: ['livevideo.continuityMethod.invalid'],
      }) as never,
    );

    const result = await validator.validate(new Uint8Array([0x00]), 1);

    expect(result.isValid).toBe(true);
    expect(result.errorCodes).toEqual([]);
  });

  it('does not suppress continuity failures on the second segment', async () => {
    // First segment (consumes isFirstSegment flag)
    mockValidate.mockResolvedValue(makeCmlResult() as never);
    await validator.validate(new Uint8Array([0x00]), 1);

    // Second segment with continuity failure
    mockValidate.mockResolvedValue(
      makeCmlResult({
        isValid: false,
        errorCodes: ['livevideo.continuityMethod.invalid'],
      }) as never,
    );

    const result = await validator.validate(new Uint8Array([0x00]), 2);

    expect(result.isValid).toBe(false);
  });

  it('does not suppress non-continuity errors on the first segment', async () => {
    mockValidate.mockResolvedValue(
      makeCmlResult({
        isValid: false,
        errorCodes: ['livevideo.segment.invalid'],
      }) as never,
    );

    const result = await validator.validate(new Uint8Array([0x00]), 1);

    expect(result.isValid).toBe(false);
  });

  it('uses fallbackIndex when CML returns no sequenceNumber', async () => {
    mockValidate.mockResolvedValue(makeCmlResult({ sequenceNumber: null }) as never);

    const result = await validator.validate(new Uint8Array([0x00]), 42);

    expect(result.sequenceNumber).toBe(42);
  });

  it('reset restores first segment suppression', async () => {
    // Consume first segment
    mockValidate.mockResolvedValue(makeCmlResult() as never);
    await validator.validate(new Uint8Array([0x00]), 1);

    validator.reset();

    // After reset, continuity suppression should work again
    mockValidate.mockResolvedValue(
      makeCmlResult({
        isValid: false,
        errorCodes: ['livevideo.continuityMethod.invalid'],
      }) as never,
    );

    const result = await validator.validate(new Uint8Array([0x00]), 1);

    expect(result.isValid).toBe(true);
  });
});
