import { describe, it, expect } from 'vitest';
import { parseManifest, injectStreamId, isObject } from '../c2pa/manifest.js';

describe('isObject', () => {
  it('returns true for a plain object', () => {
    expect(isObject({ a: 1 })).toBe(true);
  });

  it('returns true for an empty object', () => {
    expect(isObject({})).toBe(true);
  });

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isObject('hello')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isObject(42)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isObject(undefined)).toBe(false);
  });

  it('returns true for an array (arrays are objects)', () => {
    expect(isObject([1, 2])).toBe(true);
  });
});

describe('parseManifest', () => {
  it('parses a valid JSON manifest', () => {
    const json = JSON.stringify({
      assertions: [{ label: 'c2pa.livevideo.segment', data: {} }],
    });
    const result = parseManifest(json);
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions![0].label).toBe('c2pa.livevideo.segment');
  });

  it('parses a manifest without assertions', () => {
    const result = parseManifest('{}');
    expect(result.assertions).toBeUndefined();
  });

  it('throws for invalid JSON', () => {
    expect(() => parseManifest('not json')).toThrow();
  });

  it('throws when the parsed value is not an object', () => {
    expect(() => parseManifest('"just a string"')).toThrow('Manifest must be a JSON object');
  });

  it('throws when assertions is not an array', () => {
    expect(() => parseManifest('{"assertions": "bad"}')).toThrow(
      'Manifest assertions must be an array',
    );
  });
});

describe('injectStreamId', () => {
  it('sets streamId on the c2pa.livevideo.segment assertion', () => {
    const manifest = {
      assertions: [
        { label: 'c2pa.livevideo.segment', data: { sequenceNumber: 0 } },
      ],
    };
    injectStreamId(manifest, 'my-stream');
    expect(manifest.assertions[0].data!['streamId']).toBe('my-stream');
  });

  it('does nothing when no c2pa.livevideo.segment assertion exists', () => {
    const manifest = {
      assertions: [{ label: 'other.assertion', data: {} }],
    };
    injectStreamId(manifest, 'my-stream');
    expect(manifest.assertions[0].data).not.toHaveProperty('streamId');
  });

  it('does nothing when assertions is undefined', () => {
    const manifest = {};
    expect(() => injectStreamId(manifest, 'my-stream')).not.toThrow();
  });

  it('does nothing when assertion data is undefined', () => {
    const manifest = {
      assertions: [{ label: 'c2pa.livevideo.segment' }],
    };
    expect(() => injectStreamId(manifest, 'my-stream')).not.toThrow();
  });
});
