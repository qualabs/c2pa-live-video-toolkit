import { describe, it, expect, beforeEach } from 'vitest';
import { StreamStateService } from '../services/StreamStateService.js';
import { SegmentRepository } from '../data/repository.js';
import { resetStore } from '../data/store.js';

describe('StreamStateService', () => {
  let service: StreamStateService;
  let repository: SegmentRepository;

  beforeEach(() => {
    resetStore();
    repository = new SegmentRepository();
    service = new StreamStateService(repository);
  });

  describe('segment patterns', () => {
    it('returns null patterns when none are set', () => {
      const { segmentPattern, initPattern } = service.getSegmentPatterns('v0');
      expect(segmentPattern).toBeNull();
      expect(initPattern).toBeNull();
    });

    it('stores and retrieves patterns', () => {
      service.setSegmentPatterns('v0', 'media-$Number$.m4s', 'init-$RepresentationID$.m4s');
      const { segmentPattern, initPattern } = service.getSegmentPatterns('v0');
      expect(segmentPattern).toBe('media-$Number$.m4s');
      expect(initPattern).toBe('init-$RepresentationID$.m4s');
    });
  });

  describe('initializeLastProcessedIfNeeded', () => {
    it('sets lastProcessed to startNumber - 1 on first call', () => {
      service.initializeLastProcessedIfNeeded('v0', 5);
      expect(service.getLastProcessedOrDefault('v0', -1)).toBe(4);
    });

    it('does not overwrite existing lastProcessed', () => {
      repository.setLastProcessed('v0', 10);
      service.initializeLastProcessedIfNeeded('v0', 5);
      expect(service.getLastProcessedOrDefault('v0', -1)).toBe(10);
    });
  });

  describe('isStreamReset', () => {
    it('returns false when lastProcessed is not set', () => {
      expect(service.isStreamReset('v0', 100)).toBe(false);
    });

    it('returns false when lastProcessed is within the timeline', () => {
      repository.setLastProcessed('v0', 50);
      expect(service.isStreamReset('v0', 100)).toBe(false);
    });

    it('returns true when lastProcessed exceeds the timeline max', () => {
      repository.setLastProcessed('v0', 200);
      expect(service.isStreamReset('v0', 100)).toBe(true);
    });

    it('returns false when lastProcessed equals the timeline max', () => {
      repository.setLastProcessed('v0', 100);
      expect(service.isStreamReset('v0', 100)).toBe(false);
    });
  });

  describe('resetRepresentationState', () => {
    it('resets lastProcessed, queues, and previous segment path', () => {
      repository.setLastProcessed('v0', 50);
      repository.addToReadyList('v0', { fileKey: 'seg-1' });
      repository.addToWaitingSet('v0', 'seg-2');
      repository.setPreviousSignedSegmentPath('v0', '/tmp/signed.m4s');

      service.resetRepresentationState('v0', 1);

      expect(repository.getLastProcessed('v0')).toBe(0);
      expect(repository.getReadyList('v0')).toEqual([]);
      expect(repository.hasInWaitingSet('v0', 'seg-2')).toBe(false);
      expect(repository.getPreviousSignedSegmentPath('v0')).toBeUndefined();
    });
  });

  describe('resetStreamState', () => {
    it('clears manifest state and global waiting list', () => {
      repository.setManifestContent('t1', 'xml');
      repository.addToManifestQueue({ publishTime: 't1', receivedTimestamp: 100 });
      repository.addToGlobalWaitingList('file-a');

      service.resetStreamState();

      expect(repository.getManifestContent('t1')).toBeUndefined();
      expect(repository.getManifestQueue()).toEqual([]);
      expect(repository.getAllFromGlobalWaitingList()).toEqual([]);
    });
  });

  describe('previous signed segment paths', () => {
    it('stores and retrieves the path', () => {
      service.storePreviousSignedSegmentPath('v0', '/tmp/signed_v0/chunk.m4s');
      expect(service.getPreviousSignedSegmentPath('v0')).toBe('/tmp/signed_v0/chunk.m4s');
    });

    it('returns undefined when not set', () => {
      expect(service.getPreviousSignedSegmentPath('v0')).toBeUndefined();
    });
  });

  describe('getAllRepresentationIds', () => {
    it('returns ids from all registered segment patterns', () => {
      service.setSegmentPatterns('v0', 'p1', 'i1');
      service.setSegmentPatterns('a0', 'p2', 'i2');
      const ids = service.getAllRepresentationIds();
      expect(ids).toContain('v0');
      expect(ids).toContain('a0');
    });
  });
});
