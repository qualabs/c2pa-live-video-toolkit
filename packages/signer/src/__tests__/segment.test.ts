import { describe, it, expect } from 'vitest';
import { resolveInitKey, resolveSegmentKey, extractSegmentInfo } from '../utils/segment.js';

describe('resolveInitKey', () => {
  it('replaces $RepresentationID$ with the representation id', () => {
    expect(resolveInitKey('init-stream$RepresentationID$.m4s', '0')).toBe('init-stream0.m4s');
  });

  it('handles representation ids with multiple characters', () => {
    expect(resolveInitKey('init/$RepresentationID$/init.mp4', 'video_720p')).toBe(
      'init/video_720p/init.mp4',
    );
  });
});

describe('resolveSegmentKey', () => {
  it('replaces both $RepresentationID$ and $Number$ without padding', () => {
    expect(
      resolveSegmentKey('chunk-stream$RepresentationID$-$Number$.m4s', '0', 42),
    ).toBe('chunk-stream0-42.m4s');
  });

  it('pads the segment number when $Number%05d$ format is used', () => {
    expect(
      resolveSegmentKey('chunk-stream$RepresentationID$-$Number%05d$.m4s', '0', 7),
    ).toBe('chunk-stream0-00007.m4s');
  });

  it('pads with a different width', () => {
    expect(
      resolveSegmentKey('seg-$RepresentationID$-$Number%03d$.m4s', 'v1', 99),
    ).toBe('seg-v1-099.m4s');
  });

  it('does not pad when number already meets the width', () => {
    expect(
      resolveSegmentKey('seg$RepresentationID$-$Number%05d$.m4s', '0', 12345),
    ).toBe('seg0-12345.m4s');
  });
});

describe('extractSegmentInfo', () => {
  const PATTERN = 'chunk-stream$RepresentationID$-$Number%05d$.m4s';

  it('extracts repId and segmentId from a matching file key', () => {
    const result = extractSegmentInfo('chunk-stream0-00042.m4s', PATTERN);
    expect(result).toEqual({ repId: '0', segmentId: '00042' });
  });

  it('returns null when the file key does not match the pattern', () => {
    expect(extractSegmentInfo('other-file.m4s', PATTERN)).toBeNull();
  });

  it('returns null when the segment number has wrong padding width', () => {
    expect(extractSegmentInfo('chunk-stream0-42.m4s', PATTERN)).toBeNull();
  });

  it('works with unpadded $Number$ patterns', () => {
    const unpadded = 'video_$RepresentationID$_$Number$.m4s';
    const result = extractSegmentInfo('video_720p_123.m4s', unpadded);
    expect(result).toEqual({ repId: '720p', segmentId: '123' });
  });

  it('works with path-like patterns', () => {
    const pathPattern = 'output/chunk-stream$RepresentationID$-$Number%05d$.m4s';
    const result = extractSegmentInfo('output/chunk-stream1-00001.m4s', pathPattern);
    expect(result).toEqual({ repId: '1', segmentId: '00001' });
  });
});
