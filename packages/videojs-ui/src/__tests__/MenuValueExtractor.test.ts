import { describe, it, expect } from 'vitest';
import { extractMenuValue, renderMenuItemHtml } from '../components/MenuValueExtractor.js';
import type { PlaybackStatus } from '../types.js';

function makeStatusWithManifest(manifest: unknown): PlaybackStatus {
  return {
    verified: true,
    details: {
      video: { verified: true, manifest, error: null },
    },
  };
}

const MANIFEST_WITH_ISSUER = {
  signatureInfo: { issuer: 'Test CA', time: '2025-01-15T12:00:00Z' },
  claimGenerator: 'test-tool/1.0',
  assertions: [
    {
      label: 'stds.schema-org.CreativeWork',
      data: { author: [{ name: 'John Doe' }] },
    },
  ],
};

describe('extractMenuValue', () => {
  it('returns issuer for SIG_ISSUER', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    expect(extractMenuValue('SIG_ISSUER', status, [])).toBe('Test CA');
  });

  it('returns formatted date for DATE', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    const result = extractMenuValue('DATE', status, []);
    expect(result).toContain('2025');
    expect(result).toContain('Jan');
  });

  it('returns claim generator for CLAIM_GENERATOR', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    expect(extractMenuValue('CLAIM_GENERATOR', status, [])).toBe('test-tool/1.0');
  });

  it('returns author name for NAME', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    expect(extractMenuValue('NAME', status, [])).toBe('John Doe');
  });

  it('returns "Passed" for VALIDATION_STATUS when verified is true', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    expect(extractMenuValue('VALIDATION_STATUS', status, [])).toBe('Passed');
  });

  it('returns "Failed" for VALIDATION_STATUS when verified is false', () => {
    const status: PlaybackStatus = {
      verified: false,
      details: { video: { verified: false, manifest: MANIFEST_WITH_ISSUER, error: 'fail' } },
    };
    expect(extractMenuValue('VALIDATION_STATUS', status, [])).toBe('Failed');
  });

  it('returns "Unknown" for VALIDATION_STATUS when verified is undefined', () => {
    const status: PlaybackStatus = { verified: undefined, details: {} };
    expect(extractMenuValue('VALIDATION_STATUS', status, [])).toBe('Unknown');
  });

  it('returns alert message for ALERT when regions exist', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    const result = extractMenuValue('ALERT', status, ['01:00-01:30']);
    expect(result).toContain('01:00-01:30');
    expect(result).toContain('tampered');
  });

  it('returns null for ALERT when no regions', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    expect(extractMenuValue('ALERT', status, [])).toBeNull();
  });

  it('returns null for LOCATION (not implemented)', () => {
    const status = makeStatusWithManifest(MANIFEST_WITH_ISSUER);
    expect(extractMenuValue('LOCATION', status, [])).toBeNull();
  });

  it('returns null when manifest is missing', () => {
    const status: PlaybackStatus = { verified: undefined, details: {} };
    expect(extractMenuValue('SIG_ISSUER', status, [])).toBeNull();
  });
});

describe('renderMenuItemHtml', () => {
  it('renders a simple key-value item', () => {
    const html = renderMenuItemHtml('SIG_ISSUER', 'Issued by', 'Test CA');
    expect(html).toContain('Issued by');
    expect(html).toContain('Test CA');
  });

  it('renders long values on a new line', () => {
    const longValue = 'This is a very long claim generator string';
    const html = renderMenuItemHtml('CLAIM_GENERATOR', 'App', longValue);
    expect(html).toContain('<div class="itemName">');
    expect(html).toContain(longValue);
  });

  it('renders WEBSITE as a link', () => {
    const html = renderMenuItemHtml('WEBSITE', 'Website', 'https://example.com');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it('renders ALERT with alert-div wrapper', () => {
    const html = renderMenuItemHtml('ALERT', 'Alert', 'Something was tampered');
    expect(html).toContain('alert-div');
    expect(html).toContain('Something was tampered');
  });

  it('renders VALIDATION_STATUS failed as nextLine', () => {
    const html = renderMenuItemHtml('VALIDATION_STATUS', 'Status', 'Failed');
    expect(html).toContain('nextLine');
  });

  it('renders SOCIAL as provider links', () => {
    const urls = ['https://youtube.com/watch?v=abc', 'https://instagram.com/user'];
    const html = renderMenuItemHtml('SOCIAL', 'Social Media', urls);
    expect(html).toContain('YouTube');
    expect(html).toContain('Instagram');
  });
});
