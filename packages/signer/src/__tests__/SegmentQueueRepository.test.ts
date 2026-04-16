import { describe, it, expect, beforeEach } from 'vitest';
import { SegmentQueueRepository } from '../data/SegmentQueueRepository.js';
import { resetStore } from '../data/store.js';

describe('SegmentQueueRepository', () => {
  let repo: SegmentQueueRepository;

  beforeEach(() => {
    resetStore();
    repo = new SegmentQueueRepository();
  });

  describe('ready list', () => {
    it('returns an empty array for unknown repId', () => {
      expect(repo.getReadyList('unknown')).toEqual([]);
    });

    it('adds jobs to the front (LIFO insert) and removes from the back (FIFO dequeue)', () => {
      repo.addToReadyList('v0', { fileKey: 'seg-1' });
      repo.addToReadyList('v0', { fileKey: 'seg-2' });

      // readyList is [seg-2, seg-1], pop returns seg-1 first (FIFO)
      expect(repo.removeFromReadyList('v0')).toEqual({ fileKey: 'seg-1' });
      expect(repo.removeFromReadyList('v0')).toEqual({ fileKey: 'seg-2' });
      expect(repo.removeFromReadyList('v0')).toBeUndefined();
    });

    it('clearReadyList empties the list', () => {
      repo.addToReadyList('v0', { fileKey: 'seg-1' });
      repo.clearReadyList('v0');
      expect(repo.getReadyList('v0')).toEqual([]);
    });
  });

  describe('waiting set', () => {
    it('returns false for a key not in the set', () => {
      expect(repo.hasInWaitingSet('v0', 'seg-5')).toBe(false);
    });

    it('adds and checks membership', () => {
      repo.addToWaitingSet('v0', 'seg-5');
      expect(repo.hasInWaitingSet('v0', 'seg-5')).toBe(true);
    });

    it('removes from the set', () => {
      repo.addToWaitingSet('v0', 'seg-5');
      repo.removeFromWaitingSet('v0', 'seg-5');
      expect(repo.hasInWaitingSet('v0', 'seg-5')).toBe(false);
    });

    it('clearWaitingSet empties the set', () => {
      repo.addToWaitingSet('v0', 'seg-5');
      repo.addToWaitingSet('v0', 'seg-6');
      repo.clearWaitingSet('v0');
      expect(repo.hasInWaitingSet('v0', 'seg-5')).toBe(false);
      expect(repo.hasInWaitingSet('v0', 'seg-6')).toBe(false);
    });
  });

  describe('global waiting list', () => {
    it('starts empty', () => {
      expect(repo.getAllFromGlobalWaitingList()).toEqual([]);
    });

    it('adds and retrieves entries', () => {
      repo.addToGlobalWaitingList('file-a');
      repo.addToGlobalWaitingList('file-b');
      expect(repo.getAllFromGlobalWaitingList()).toContain('file-a');
      expect(repo.getAllFromGlobalWaitingList()).toContain('file-b');
    });

    it('removes individual entries', () => {
      repo.addToGlobalWaitingList('file-a');
      repo.removeFromGlobalWaitingList('file-a');
      expect(repo.getAllFromGlobalWaitingList()).toEqual([]);
    });

    it('clearGlobalWaitingList empties everything', () => {
      repo.addToGlobalWaitingList('file-a');
      repo.addToGlobalWaitingList('file-b');
      repo.clearGlobalWaitingList();
      expect(repo.getAllFromGlobalWaitingList()).toEqual([]);
    });
  });

  describe('segment data', () => {
    it('returns undefined for unknown segment', () => {
      expect(repo.getSegmentData('v0', '1')).toBeUndefined();
    });

    it('stores and retrieves segment data', () => {
      const data = { hash: 'abc123', certHash: 'def456' };
      repo.setSegmentData('v0', '1', data);
      expect(repo.getSegmentData('v0', '1')).toEqual(data);
    });

    it('isolates data between representations', () => {
      repo.setSegmentData('v0', '1', { hash: 'a', certHash: 'b' });
      repo.setSegmentData('v1', '1', { hash: 'c', certHash: 'd' });
      expect(repo.getSegmentData('v0', '1')?.hash).toBe('a');
      expect(repo.getSegmentData('v1', '1')?.hash).toBe('c');
    });
  });
});
