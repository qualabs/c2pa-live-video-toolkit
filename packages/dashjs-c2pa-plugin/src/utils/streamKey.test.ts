import { describe, it, expect } from 'vitest';
import { buildStreamKey } from './streamKey.js';

describe('buildStreamKey', () => {
  it('builds a key from mediaType and representationId', () => {
    expect(buildStreamKey('video', 'rep1')).toBe('video-rep1');
  });

  it('converts a numeric representationId to string', () => {
    expect(buildStreamKey('audio', 42)).toBe('audio-42');
  });

  it('uses "unknown" when mediaType is null', () => {
    expect(buildStreamKey(null, 'rep1')).toBe('unknown-rep1');
  });

  it('uses "unknown" when mediaType is undefined', () => {
    expect(buildStreamKey(undefined, 'rep1')).toBe('unknown-rep1');
  });

  it('uses "default" when representationId is null', () => {
    expect(buildStreamKey('video', null)).toBe('video-default');
  });

  it('uses "default" when representationId is undefined', () => {
    expect(buildStreamKey('video', undefined)).toBe('video-default');
  });

  it('uses "unknown" and "default" when both arguments are null', () => {
    expect(buildStreamKey(null, null)).toBe('unknown-default');
  });
});
