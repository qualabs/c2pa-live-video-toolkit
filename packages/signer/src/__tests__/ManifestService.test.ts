import { describe, it, expect, beforeEach } from 'vitest';
import { ManifestService } from '../services/ManifestService.js';
import { SegmentRepository } from '../data/repository.js';
import { resetStore } from '../data/store.js';

describe('ManifestService', () => {
  let service: ManifestService;
  let repository: SegmentRepository;

  beforeEach(() => {
    resetStore();
    repository = new SegmentRepository();
    service = new ManifestService(repository);
  });

  describe('enqueueManifest', () => {
    it('returns true and enqueues on first call for a publishTime', () => {
      const result = service.enqueueManifest('2025-01-01T00:00:00Z', Date.now());
      expect(result).toBe(true);
    });

    it('returns false for a duplicate publishTime', () => {
      service.enqueueManifest('2025-01-01T00:00:00Z', Date.now());
      const result = service.enqueueManifest('2025-01-01T00:00:00Z', Date.now());
      expect(result).toBe(false);
    });
  });

  describe('isManifestReady', () => {
    it('returns not ready when requirements are missing', () => {
      const { ready } = service.isManifestReady('t1', () => 0);
      expect(ready).toBe(false);
    });

    it('returns ready when all representations meet their requirements', () => {
      service.storeManifestRequirements('t1', { v0: 5, a0: 5 });

      const { ready, missingReps } = service.isManifestReady('t1', (repId) =>
        repId === 'v0' ? 5 : 5,
      );
      expect(ready).toBe(true);
      expect(missingReps).toEqual([]);
    });

    it('returns not ready with missing reps when some are behind', () => {
      service.storeManifestRequirements('t1', { v0: 10, a0: 10 });

      const { ready, missingReps } = service.isManifestReady('t1', (repId) =>
        repId === 'v0' ? 10 : 5,
      );
      expect(ready).toBe(false);
      expect(missingReps).toEqual(['a0']);
    });
  });

  describe('getManifestQueueSorted', () => {
    it('returns manifests sorted by publishTime ascending', () => {
      service.enqueueManifest('2025-01-03T00:00:00Z', 300);
      service.enqueueManifest('2025-01-01T00:00:00Z', 100);
      service.enqueueManifest('2025-01-02T00:00:00Z', 200);

      const sorted = service.getManifestQueueSorted();
      expect(sorted.map((m) => m.publishTime)).toEqual([
        '2025-01-01T00:00:00Z',
        '2025-01-02T00:00:00Z',
        '2025-01-03T00:00:00Z',
      ]);
    });
  });

  describe('completeManifest', () => {
    it('returns the content and cleans up all state', () => {
      const pt = '2025-01-01T00:00:00Z';
      service.storeManifestContent(pt, '<MPD>content</MPD>');
      service.storeManifestRequirements(pt, { v0: 5 });
      service.enqueueManifest(pt, 100);

      const content = service.completeManifest(pt);
      expect(content).toBe('<MPD>content</MPD>');

      // All state cleaned
      expect(service.getManifestRequirements(pt)).toBeUndefined();
      expect(service.getManifestQueueSorted()).toEqual([]);
    });

    it('returns undefined when content does not exist', () => {
      expect(service.completeManifest('nonexistent')).toBeUndefined();
    });
  });

  describe('removeManifest', () => {
    it('cleans up all state for a publishTime', () => {
      const pt = '2025-01-01T00:00:00Z';
      service.storeManifestContent(pt, '<MPD/>');
      service.storeManifestRequirements(pt, { v0: 1 });
      service.enqueueManifest(pt, 100);

      service.removeManifest(pt);

      expect(service.getManifestRequirements(pt)).toBeUndefined();
      expect(service.getManifestQueueSorted()).toEqual([]);
    });
  });
});
