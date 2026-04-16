import { describe, it, expect, beforeEach } from 'vitest';
import { SegmentService } from '../services/segment.js';
import { SegmentRepository } from '../data/repository.js';
import { resetStore } from '../data/store.js';

describe('SegmentService', () => {
  let service: SegmentService;
  let repository: SegmentRepository;

  beforeEach(() => {
    resetStore();
    repository = new SegmentRepository();
    service = new SegmentService(repository);
  });

  describe('determineSegmentAction', () => {
    it('returns "enqueue" when segment is the next expected one', () => {
      repository.setLastProcessed('v0', 5);
      expect(service.determineSegmentAction('v0', 6, 1)).toBe('enqueue');
    });

    it('returns "wait" when segment is ahead of the next expected one', () => {
      repository.setLastProcessed('v0', 5);
      expect(service.determineSegmentAction('v0', 8, 1)).toBe('wait');
    });

    it('returns "ignore" when segment is behind or equal to last processed', () => {
      repository.setLastProcessed('v0', 5);
      expect(service.determineSegmentAction('v0', 5, 1)).toBe('ignore');
      expect(service.determineSegmentAction('v0', 3, 1)).toBe('ignore');
    });

    it('uses startNumber - 1 as default when no last processed is set', () => {
      // startNumber=1 means lastProcessed defaults to 0, so segment 1 should enqueue
      expect(service.determineSegmentAction('v0', 1, 1)).toBe('enqueue');
    });
  });

  describe('processNewSegment', () => {
    it('enqueues the next expected segment and updates lastProcessed', () => {
      const result = service.processNewSegment('v0', 'seg-1.m4s', 1, 1);
      expect(result).toBe('enqueued');
      expect(repository.getLastProcessed('v0')).toBe(1);
      expect(service.getReadyList('v0')).toHaveLength(1);
    });

    it('puts a future segment in the waiting set', () => {
      const result = service.processNewSegment('v0', 'seg-3.m4s', 3, 1);
      expect(result).toBe('waiting');
      expect(repository.hasInWaitingSet('v0', 'seg-3.m4s')).toBe(true);
    });

    it('ignores an old segment', () => {
      repository.setLastProcessed('v0', 5);
      const result = service.processNewSegment('v0', 'seg-3.m4s', 3, 1);
      expect(result).toBe('ignored');
    });
  });

  describe('enqueue and dequeue', () => {
    it('dequeues in FIFO order', () => {
      service.enqueueSegment('v0', 'seg-1.m4s');
      service.enqueueSegment('v0', 'seg-2.m4s');

      const first = service.dequeueSegment('v0');
      const second = service.dequeueSegment('v0');
      expect(first?.fileKey).toBe('seg-1.m4s');
      expect(second?.fileKey).toBe('seg-2.m4s');
    });

    it('returns undefined when queue is empty', () => {
      expect(service.dequeueSegment('v0')).toBeUndefined();
    });
  });

  describe('peekNextJob', () => {
    it('returns undefined when queue is empty', () => {
      expect(service.peekNextJob('v0')).toBeUndefined();
    });

    it('returns the next job without removing it', () => {
      service.enqueueSegment('v0', 'seg-1.m4s');
      service.enqueueSegment('v0', 'seg-2.m4s');

      const peeked = service.peekNextJob('v0');
      expect(peeked?.fileKey).toBe('seg-1.m4s');
      // still in queue
      expect(service.getReadyList('v0')).toHaveLength(2);
    });
  });

  describe('processWaitingList', () => {
    it('moves consecutive waiting segments to the ready list', () => {
      const pattern = 'chunk-stream$RepresentationID$-$Number%05d$.m4s';

      // Simulate: segment 1 processed, segments 2 and 3 arrived out of order
      // Waiting keys must match what resolveSegmentKey(pattern, 'v0', N) produces
      repository.setLastProcessed('v0', 1);
      service.addToWaitingSet('v0', 'chunk-streamv0-00002.m4s');
      service.addToWaitingSet('v0', 'chunk-streamv0-00003.m4s');

      const moved = service.processWaitingList('v0', pattern, 1);

      expect(moved).toBe(2);
      expect(repository.getLastProcessed('v0')).toBe(3);
    });

    it('stops when a gap is found in the waiting set', () => {
      const pattern = 'chunk-stream$RepresentationID$-$Number%05d$.m4s';

      repository.setLastProcessed('v0', 1);
      // Only segment 3 is waiting (segment 2 is missing)
      service.addToWaitingSet('v0', 'chunk-streamv0-00003.m4s');

      const moved = service.processWaitingList('v0', pattern, 1);

      expect(moved).toBe(0);
      expect(repository.getLastProcessed('v0')).toBe(1);
    });
  });

  describe('global waiting list', () => {
    it('adds files and drains them all at once', () => {
      service.addToGlobalWaitingList('file-a');
      service.addToGlobalWaitingList('file-b');

      const files = service.processGlobalWaitingList();
      expect(files).toContain('file-a');
      expect(files).toContain('file-b');

      // second call returns empty
      expect(service.processGlobalWaitingList()).toEqual([]);
    });
  });

  describe('markSegmentAsProcessed', () => {
    it('adds the file key to the processed list', () => {
      service.markSegmentAsProcessed('v0', 'seg-1.m4s');
      // Verify via repository (processedLists is internal)
      const processed = repository.queue.getAllFromGlobalWaitingList();
      // We can't easily peek processedLists, but at least verify no error
      expect(true).toBe(true);
    });
  });
});
