import { describe, it, expect, beforeEach } from 'vitest';
import { StreamStateRepository } from '../data/StreamStateRepository.js';
import { resetStore } from '../data/store.js';
import { DEFAULT_MPD_POLLING_INTERVAL_MS } from '../constants.js';

describe('StreamStateRepository', () => {
  let repo: StreamStateRepository;

  beforeEach(() => {
    resetStore();
    repo = new StreamStateRepository();
  });

  describe('segment patterns', () => {
    it('returns undefined for unknown repId', () => {
      expect(repo.getSegmentPattern('v0')).toBeUndefined();
    });

    it('stores and retrieves segment patterns', () => {
      repo.setSegmentPattern('v0', 'chunk-$RepresentationID$-$Number%05d$.m4s');
      expect(repo.getSegmentPattern('v0')).toBe('chunk-$RepresentationID$-$Number%05d$.m4s');
    });
  });

  describe('init patterns', () => {
    it('stores and retrieves init patterns', () => {
      repo.setInitPattern('v0', 'init-$RepresentationID$.m4s');
      expect(repo.getInitPattern('v0')).toBe('init-$RepresentationID$.m4s');
    });
  });

  describe('representation ids', () => {
    it('returns empty array when no patterns are set', () => {
      expect(repo.getAllRepresentationIds()).toEqual([]);
    });

    it('returns all representation ids that have segment patterns', () => {
      repo.setSegmentPattern('v0', 'pattern-a');
      repo.setSegmentPattern('a0', 'pattern-b');
      const ids = repo.getAllRepresentationIds();
      expect(ids).toContain('v0');
      expect(ids).toContain('a0');
      expect(ids).toHaveLength(2);
    });
  });

  describe('last processed', () => {
    it('returns undefined when not set', () => {
      expect(repo.getLastProcessed('v0')).toBeUndefined();
    });

    it('hasLastProcessed returns false when not set', () => {
      expect(repo.hasLastProcessed('v0')).toBe(false);
    });

    it('stores and retrieves last processed number', () => {
      repo.setLastProcessed('v0', 42);
      expect(repo.getLastProcessed('v0')).toBe(42);
      expect(repo.hasLastProcessed('v0')).toBe(true);
    });
  });

  describe('MPD polling interval', () => {
    it('returns the default value initially', () => {
      expect(repo.getMpdPollingInterval()).toBe(DEFAULT_MPD_POLLING_INTERVAL_MS);
    });

    it('stores and retrieves a custom interval', () => {
      repo.setMpdPollingInterval(5000);
      expect(repo.getMpdPollingInterval()).toBe(5000);
    });
  });

  describe('previous signed segment paths', () => {
    it('returns undefined when not set', () => {
      expect(repo.getPreviousSignedSegmentPath('v0')).toBeUndefined();
    });

    it('stores and retrieves paths', () => {
      repo.setPreviousSignedSegmentPath('v0', '/tmp/signed_v0/chunk-00001.m4s');
      expect(repo.getPreviousSignedSegmentPath('v0')).toBe('/tmp/signed_v0/chunk-00001.m4s');
    });

    it('clears the path', () => {
      repo.setPreviousSignedSegmentPath('v0', '/tmp/signed.m4s');
      repo.clearPreviousSignedSegmentPath('v0');
      expect(repo.getPreviousSignedSegmentPath('v0')).toBeUndefined();
    });
  });

  describe('stream generation', () => {
    it('returns 0 for an unknown repId', () => {
      expect(repo.getGeneration('v0')).toBe(0);
    });

    it('increments from 0 to 1 on first call', () => {
      repo.incrementGeneration('v0');
      expect(repo.getGeneration('v0')).toBe(1);
    });

    it('increments independently per repId', () => {
      repo.incrementGeneration('v0');
      repo.incrementGeneration('v0');
      repo.incrementGeneration('a0');
      expect(repo.getGeneration('v0')).toBe(2);
      expect(repo.getGeneration('a0')).toBe(1);
    });

    it('resets to 0 after resetStore', () => {
      repo.incrementGeneration('v0');
      resetStore();
      expect(repo.getGeneration('v0')).toBe(0);
    });
  });
});
