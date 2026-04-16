import { describe, it, expect } from 'vitest';
import { extractActiveManifest } from '../ManifestNormalizer.js';
import type { PlaybackStatus } from '../types.js';

function makeStatus(manifest: unknown): PlaybackStatus {
  return {
    verified: true,
    details: {
      video: { verified: true, manifest, error: null },
    },
  };
}

describe('extractActiveManifest', () => {
  it('returns null when video detail is missing', () => {
    const status: PlaybackStatus = { verified: undefined, details: {} };
    expect(extractActiveManifest(status)).toBeNull();
  });

  it('returns null when manifest is null', () => {
    expect(extractActiveManifest(makeStatus(null))).toBeNull();
  });

  it('returns null when manifest is a primitive', () => {
    expect(extractActiveManifest(makeStatus('not an object'))).toBeNull();
  });

  it('extracts from a flat activeManifest field (camelCase)', () => {
    const manifest = {
      activeManifest: {
        signatureInfo: { issuer: 'Test CA' },
        claimGenerator: 'test-tool/1.0',
      },
    };
    const result = extractActiveManifest(makeStatus(manifest));
    expect(result?.signatureInfo?.issuer).toBe('Test CA');
    expect(result?.claimGenerator).toBe('test-tool/1.0');
  });

  it('extracts from manifestStore envelope with active_manifest label (snake_case)', () => {
    const manifest = {
      manifestStore: {
        active_manifest: 'urn:c2pa:manifest-1',
        manifests: {
          'urn:c2pa:manifest-1': {
            signature_info: { issuer: 'Snake CA' },
            claim_generator: 'snake-tool/2.0',
          },
        },
      },
    };
    const result = extractActiveManifest(makeStatus(manifest));
    expect(result?.signatureInfo?.issuer).toBe('Snake CA');
    expect(result?.claimGenerator).toBe('snake-tool/2.0');
  });

  it('extracts from a flat object with signatureInfo (no wrapper)', () => {
    const manifest = {
      signatureInfo: { issuer: 'Direct CA' },
      claimGenerator: 'direct/1.0',
      assertions: [{ label: 'test', data: {} }],
    };
    const result = extractActiveManifest(makeStatus(manifest));
    expect(result?.signatureInfo?.issuer).toBe('Direct CA');
    expect(result?.assertions).toHaveLength(1);
  });

  it('normalizes snake_case fields to camelCase', () => {
    const manifest = {
      signature_info: { issuer: 'Snake Issuer' },
      claim_generator: 'snake-gen',
    };
    const result = extractActiveManifest(makeStatus(manifest));
    expect(result?.signatureInfo?.issuer).toBe('Snake Issuer');
    expect(result?.claimGenerator).toBe('snake-gen');
  });

  it('returns null for an empty object', () => {
    expect(extractActiveManifest(makeStatus({}))).toBeNull();
  });
});
