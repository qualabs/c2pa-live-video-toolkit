import { describe, it, expect, beforeEach } from 'vitest';
import { ManifestRepository } from '../data/ManifestRepository.js';
import { resetStore } from '../data/store.js';

describe('ManifestRepository', () => {
  let repo: ManifestRepository;

  beforeEach(() => {
    resetStore();
    repo = new ManifestRepository();
  });

  describe('manifest content', () => {
    it('returns undefined for unknown publishTime', () => {
      expect(repo.getManifestContent('2025-01-01T00:00:00Z')).toBeUndefined();
    });

    it('stores and retrieves content', () => {
      repo.setManifestContent('2025-01-01T00:00:00Z', '<MPD>...</MPD>');
      expect(repo.getManifestContent('2025-01-01T00:00:00Z')).toBe('<MPD>...</MPD>');
    });

    it('deletes content', () => {
      repo.setManifestContent('2025-01-01T00:00:00Z', '<MPD/>');
      repo.deleteManifestContent('2025-01-01T00:00:00Z');
      expect(repo.getManifestContent('2025-01-01T00:00:00Z')).toBeUndefined();
    });
  });

  describe('manifest requirements', () => {
    it('stores and retrieves requirements', () => {
      const reqs = { v0: 10, a0: 10 };
      repo.setManifestRequirements('t1', reqs);
      expect(repo.getManifestRequirements('t1')).toEqual(reqs);
    });
  });

  describe('manifest queue', () => {
    it('starts empty', () => {
      expect(repo.getManifestQueue()).toEqual([]);
    });

    it('adds items to the front', () => {
      repo.addToManifestQueue({ publishTime: 't1', receivedTimestamp: 100 });
      repo.addToManifestQueue({ publishTime: 't2', receivedTimestamp: 200 });
      const queue = repo.getManifestQueue();
      expect(queue[0].publishTime).toBe('t2');
      expect(queue[1].publishTime).toBe('t1');
    });

    it('removes by publishTime', () => {
      repo.addToManifestQueue({ publishTime: 't1', receivedTimestamp: 100 });
      repo.addToManifestQueue({ publishTime: 't2', receivedTimestamp: 200 });
      repo.removeFromManifestQueue('t1');
      expect(repo.getManifestQueue()).toHaveLength(1);
      expect(repo.getManifestQueue()[0].publishTime).toBe('t2');
    });
  });

  describe('manifest enqueued tracking', () => {
    it('returns false for unknown publishTime', () => {
      expect(repo.isManifestEnqueued('t1')).toBe(false);
    });

    it('tracks enqueued state', () => {
      repo.addToManifestEnqueued('t1');
      expect(repo.isManifestEnqueued('t1')).toBe(true);
    });

    it('removes enqueued state', () => {
      repo.addToManifestEnqueued('t1');
      repo.removeFromManifestEnqueued('t1');
      expect(repo.isManifestEnqueued('t1')).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('clears all manifest state', () => {
      repo.setManifestContent('t1', 'xml');
      repo.setManifestRequirements('t1', { v0: 5 });
      repo.addToManifestQueue({ publishTime: 't1', receivedTimestamp: 100 });
      repo.addToManifestEnqueued('t1');

      repo.clearAll();

      expect(repo.getManifestContent('t1')).toBeUndefined();
      expect(repo.getManifestRequirements('t1')).toBeUndefined();
      expect(repo.getManifestQueue()).toEqual([]);
      expect(repo.isManifestEnqueued('t1')).toBe(false);
    });
  });
});
