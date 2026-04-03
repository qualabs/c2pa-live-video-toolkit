import { describe, it, expect } from 'vitest';
import { TimeIntervalIndex } from './TimeIntervalIndex.js';

function makeEntry(valid: boolean, interval: [number, number]) {
  return {
    type: 'MediaSegment',
    manifest: null,
    interval,
    valid,
    computedHash: null,
    manifestHash: null,
  };
}

describe('TimeIntervalIndex', () => {
  it('returns false for hasStream before any insert', () => {
    expect(new TimeIntervalIndex().hasStream('video-default')).toBe(false);
  });

  it('creates a stream entry on the first insert', () => {
    const index = new TimeIntervalIndex();
    index.insert('video-default', [0, 1], makeEntry(true, [0, 1]));
    expect(index.hasStream('video-default')).toBe(true);
  });

  it('search returns entries that overlap the query interval', () => {
    const index = new TimeIntervalIndex();
    index.insert('video-default', [0, 2], makeEntry(true, [0, 2]));
    const results = index.search('video-default', [1, 1.5]);
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(true);
  });

  it('search returns an empty array for an unknown stream key', () => {
    const index = new TimeIntervalIndex();
    expect(index.search('video-default', [0, 1])).toEqual([]);
  });

  it('deduplicates: re-inserting at the same interval replaces the old entry', () => {
    const index = new TimeIntervalIndex();
    index.insert('video-default', [0, 1], makeEntry(true, [0, 1]));
    index.insert('video-default', [0, 1], makeEntry(false, [0, 1]));
    const results = index.search('video-default', [0, 1]);
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(false);
  });

  it('clear removes all streams', () => {
    const index = new TimeIntervalIndex();
    index.insert('video-default', [0, 1], makeEntry(true, [0, 1]));
    index.clear();
    expect(index.hasStream('video-default')).toBe(false);
  });
});
