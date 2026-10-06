import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitSegmentProcessor } from '../pipeline/InitSegmentProcessor.js';
import { SessionKeyStore } from '../state/SessionKeyStore.js';
import { ValidationErrorCode } from '../types.js';
import type { Logger } from '../types.js';

const SILENT_LOGGER: Logger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

vi.mock('@svta/cml-c2pa', () => ({
  validateC2paInitSegment: vi.fn(),
}));

import { validateC2paInitSegment } from '@svta/cml-c2pa';
const mockValidate = vi.mocked(validateC2paInitSegment);

describe('InitSegmentProcessor', () => {
  let processor: InitSegmentProcessor;
  let sessionKeyStore: SessionKeyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionKeyStore = new SessionKeyStore();
    processor = new InitSegmentProcessor({ sessionKeyStore, logger: SILENT_LOGGER });
  });

  it('returns success with session keys count when validation succeeds', async () => {
    const mockKey = { kid: 'kid-1', publicKey: new Uint8Array() };
    mockValidate.mockResolvedValue({
      sessionKeys: [mockKey],
      manifestId: 'manifest-1',
      manifest: null,
      certificate: null,
      isValid: true,
      errorCodes: [],
    } as never);

    const result = await processor.process(new Uint8Array([0x00]));

    expect(result.success).toBe(true);
    expect(result.sessionKeysCount).toBe(1);
    expect(result.manifestId).toBe('manifest-1');
  });

  it('adds extracted session keys to the store', async () => {
    const mockKey = { kid: 'kid-1', publicKey: new Uint8Array() };
    mockValidate.mockResolvedValue({
      sessionKeys: [mockKey],
      manifestId: null,
      manifest: null,
      certificate: null,
      isValid: true,
      errorCodes: [],
    } as never);

    await processor.process(new Uint8Array([0x00]));

    expect(sessionKeyStore.hasKeys()).toBe(true);
    expect(sessionKeyStore.getAll()[0]).toBe(mockKey);
  });

  it('accepts a ManifestBox init whose only error is the absence of session keys', async () => {
    mockValidate.mockResolvedValue({
      sessionKeys: [],
      merkleMaps: [],
      manifestId: 'manifest-1',
      manifest: null,
      certificate: null,
      isValid: false,
      errorCodes: [ValidationErrorCode.SESSION_KEY_INVALID],
    } as never);

    const result = await processor.process(new Uint8Array([0x00]));

    expect(result.success).toBe(true);
    expect(result.sessionKeysCount).toBe(0);
  });

  it('rejects an invalid init and keeps its session keys out of the store', async () => {
    const mockKey = { kid: 'kid-1', publicKey: new Uint8Array() };
    mockValidate.mockResolvedValue({
      sessionKeys: [mockKey],
      merkleMaps: [],
      manifestId: 'manifest-1',
      manifest: null,
      certificate: null,
      isValid: false,
      errorCodes: [ValidationErrorCode.SIGNATURE_MISMATCH],
    } as never);

    const result = await processor.process(new Uint8Array([0x00]));

    expect(result.success).toBe(false);
    expect(result.noC2paData).toBeUndefined();
    expect(result.sessionKeysCount).toBe(0);
    expect(result.errorCodes).toEqual([ValidationErrorCode.SIGNATURE_MISMATCH]);
    expect(sessionKeyStore.hasKeys()).toBe(false);
  });

  it('returns failure when validation throws', async () => {
    mockValidate.mockRejectedValue(new Error('parse error'));

    const result = await processor.process(new Uint8Array([0x00]));

    expect(result.success).toBe(false);
    expect(result.sessionKeysCount).toBe(0);
    expect(result.error).toBe('parse error');
  });
});
