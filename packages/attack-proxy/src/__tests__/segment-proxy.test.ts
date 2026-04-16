import { describe, it, expect } from 'vitest';
import { parseSegmentFilename, buildSegmentPath } from '../proxy/segment-proxy.js';

describe('parseSegmentFilename', () => {
  it('parses chunk-stream format', () => {
    const result = parseSegmentFilename('chunk-stream0-00042.m4s');
    expect(result).toEqual({ streamId: '0', number: 42, pattern: 'chunk-stream' });
  });

  it('parses segment format', () => {
    const result = parseSegmentFilename('segment-000001.m4s');
    expect(result).toEqual({ streamId: '0', number: 1, pattern: 'segment' });
  });

  it('parses video track format', () => {
    const result = parseSegmentFilename('video_0_123.m4s');
    expect(result).toEqual({ streamId: '0', number: 123, pattern: 'video' });
  });

  it('parses audio track format', () => {
    const result = parseSegmentFilename('audio_1_456.m4s');
    expect(result).toEqual({ streamId: '1', number: 456, pattern: 'audio' });
  });

  it('returns null for unrecognized filenames', () => {
    expect(parseSegmentFilename('something-else.mp4')).toBeNull();
  });

  it('returns null for init segments', () => {
    expect(parseSegmentFilename('init-stream0.m4s')).toBeNull();
  });
});

describe('buildSegmentPath', () => {
  it('builds chunk-stream path with 5-digit padding', () => {
    const info = { streamId: '0', number: 1, pattern: 'chunk-stream' };
    expect(buildSegmentPath(info, 42)).toBe('/chunk-stream0-00042.m4s');
  });

  it('builds segment path with 6-digit padding', () => {
    const info = { streamId: '0', number: 1, pattern: 'segment' };
    expect(buildSegmentPath(info, 7)).toBe('/segment-000007.m4s');
  });

  it('builds video track path', () => {
    const info = { streamId: '0', number: 1, pattern: 'video' };
    expect(buildSegmentPath(info, 99)).toBe('/video_0_99.m4s');
  });

  it('builds audio track path', () => {
    const info = { streamId: '1', number: 1, pattern: 'audio' };
    expect(buildSegmentPath(info, 5)).toBe('/audio_1_5.m4s');
  });

  it('defaults to chunk-stream for unknown pattern', () => {
    const info = { streamId: '0', number: 1, pattern: 'unknown' };
    expect(buildSegmentPath(info, 1)).toBe('/chunk-stream0-00001.m4s');
  });
});
