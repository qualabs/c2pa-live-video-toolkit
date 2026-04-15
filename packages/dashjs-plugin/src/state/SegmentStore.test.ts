import { describe, it, expect, vi } from 'vitest';
import { SegmentStore } from './SegmentStore.js';
import { SequenceAnomalyReason } from '../types.js';
import type { SegmentRecord } from '../types.js';

function makeSegment(
  overrides: Partial<Omit<SegmentRecord, 'arrivalIndex'>> = {},
): Omit<SegmentRecord, 'arrivalIndex'> {
  return {
    segmentNumber: 1,
    mediaType: 'video',
    sequenceNumber: 1,
    keyId: 'key-1',
    hash: 'abc123',
    status: 'valid',
    timestamp: 1000,
    ...overrides,
  };
}

describe('SegmentStore', () => {
  describe('add — new segments', () => {
    it('assigns auto-incrementing arrivalIndex to each new segment', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ segmentNumber: 1, hash: 'h1' }));
      store.add(makeSegment({ segmentNumber: 2, hash: 'h2' }));
      const [first, second] = store.getAll();
      expect(first.arrivalIndex).toBe(0);
      expect(second.arrivalIndex).toBe(1);
    });
  });

  describe('add — updating existing segments', () => {
    it('updates a segment in-place when all identity fields match', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ status: 'valid' }));
      store.add(makeSegment({ status: 'invalid' }));
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0].status).toBe('invalid');
    });

    it('preserves an anomaly status when updating a matching segment', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ status: 'replayed' }));
      store.add(makeSegment({ status: 'valid' }));
      expect(store.getAll()[0].status).toBe('replayed');
    });

    it('preserves the existing sequenceReason when the update has none', () => {
      const store = new SegmentStore(100);
      store.add(
        makeSegment({ status: 'reordered', sequenceReason: SequenceAnomalyReason.OUT_OF_ORDER }),
      );
      store.add(makeSegment({ status: 'valid' }));
      expect(store.getAll()[0].sequenceReason).toBe(SequenceAnomalyReason.OUT_OF_ORDER);
    });

    it('adopts the incoming sequenceReason when the existing one is unset', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ status: 'valid' }));
      store.add(
        makeSegment({ status: 'warning', sequenceReason: SequenceAnomalyReason.GAP_DETECTED }),
      );
      expect(store.getAll()[0].sequenceReason).toBe(SequenceAnomalyReason.GAP_DETECTED);
    });
  });

  describe('add — forceNewArrival', () => {
    it('adds a duplicate as a new entry when forceNewArrival is true', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment());
      store.add(makeSegment(), true);
      expect(store.getAll()).toHaveLength(2);
    });
  });

  describe('pruning', () => {
    it('removes the oldest segments when the limit is exceeded', () => {
      const store = new SegmentStore(3);
      store.add(makeSegment({ segmentNumber: 1, hash: 'h1' }));
      store.add(makeSegment({ segmentNumber: 2, hash: 'h2' }));
      store.add(makeSegment({ segmentNumber: 3, hash: 'h3' }));
      store.add(makeSegment({ segmentNumber: 4, hash: 'h4' }));
      const all = store.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].segmentNumber).toBe(2);
      expect(all[2].segmentNumber).toBe(4);
    });
  });

  describe('getLast', () => {
    it('returns undefined when the store is empty', () => {
      expect(new SegmentStore(100).getLast()).toBeUndefined();
    });

    it('returns the most recently added segment', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ segmentNumber: 1, hash: 'h1' }));
      store.add(makeSegment({ segmentNumber: 2, hash: 'h2' }));
      expect(store.getLast()?.segmentNumber).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('fires immediately with the current snapshot on subscription', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ segmentNumber: 1 }));
      const listener = vi.fn();
      store.subscribe(listener);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toHaveLength(1);
    });

    it('fires on every subsequent add', () => {
      const store = new SegmentStore(100);
      const listener = vi.fn();
      store.subscribe(listener);
      store.add(makeSegment({ segmentNumber: 1 }));
      store.add(makeSegment({ segmentNumber: 2, hash: 'h2' }));
      // 1 initial + 2 adds = 3 total calls
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('stops firing after the returned unsubscribe function is called', () => {
      const store = new SegmentStore(100);
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      unsubscribe();
      store.add(makeSegment());
      expect(listener).toHaveBeenCalledOnce(); // only the initial call
    });
  });

  describe('clear', () => {
    it('empties the store and resets the arrivalIndex counter', () => {
      const store = new SegmentStore(100);
      store.add(makeSegment({ segmentNumber: 1 }));
      store.clear();
      expect(store.getAll()).toHaveLength(0);
      store.add(makeSegment({ segmentNumber: 2, hash: 'h2' }));
      expect(store.getAll()[0].arrivalIndex).toBe(0);
    });

    it('notifies subscribers when cleared', () => {
      const store = new SegmentStore(100);
      const listener = vi.fn();
      store.subscribe(listener);
      store.clear();
      expect(listener).toHaveBeenCalledTimes(2); // initial + clear
    });
  });
});
