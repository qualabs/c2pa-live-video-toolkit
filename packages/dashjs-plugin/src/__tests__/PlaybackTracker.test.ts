import { describe, it, expect, vi } from 'vitest';
import { PlaybackTracker } from '../playback/PlaybackTracker.js';
import { EventBus } from '../events/EventBus.js';
import { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import type { Logger, C2paManifest } from '../types.js';

const SILENT_LOGGER: Logger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeEntry(valid: boolean, interval: [number, number]) {
  return {
    type: 'MediaSegment',
    manifest: { issuer: 'test-issuer' },
    interval,
    valid,
    computedHash: null,
    manifestHash: null,
  };
}

function buildTracker(
  timeIndex: TimeIntervalIndex,
  quality: string | null = 'rep1',
  streamManifest: C2paManifest | null = null,
) {
  const eventBus = new EventBus();
  const currentQuality: Record<string, string | number | null> = { video: quality };
  const manifest = { value: streamManifest };

  const tracker = new PlaybackTracker({
    eventBus,
    timeIndex,
    manifest,
    currentQuality,
    supportedMediaTypes: ['video'],
    logger: SILENT_LOGGER,
  });

  return { tracker, eventBus, manifest };
}

describe('PlaybackTracker', () => {
  describe('handleTimeUpdate', () => {
    it('emits a playbackStatus event on each time update', () => {
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [0, 2], makeEntry(true, [0, 2]));
      const { tracker, eventBus } = buildTracker(timeIndex);
      const listener = vi.fn();
      eventBus.on('playbackStatus', listener);

      tracker.handleTimeUpdate(1);

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('queryStatusAtTime', () => {
    it('returns verified=true when the segment at the given time is valid', () => {
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [0, 2], makeEntry(true, [0, 2]));
      const { tracker } = buildTracker(timeIndex);
      expect(tracker.queryStatusAtTime(1).verified).toBe(true);
    });

    it('returns verified=false when the segment at the given time is invalid', () => {
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [0, 2], makeEntry(false, [0, 2]));
      const { tracker } = buildTracker(timeIndex);
      expect(tracker.queryStatusAtTime(1).verified).toBe(false);
    });

    it('returns verified=undefined when no segment is found at the given time', () => {
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [10, 20], makeEntry(true, [10, 20]));
      const { tracker } = buildTracker(timeIndex);
      expect(tracker.queryStatusAtTime(1).verified).toBeUndefined();
    });

    it('uses the segment manifest when present', () => {
      const segmentManifest = { label: 'seg-manifest', instanceId: null } as C2paManifest;
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [0, 2], {
        type: 'MediaSegment',
        manifest: segmentManifest,
        interval: [0, 2],
        valid: true,
      });
      const streamManifest = { label: 'stream-manifest', instanceId: null } as C2paManifest;
      const { tracker } = buildTracker(timeIndex, 'rep1', streamManifest);

      const status = tracker.queryStatusAtTime(1);
      expect(status.details.video?.manifest).toBe(segmentManifest);
    });

    it('falls back to the stream manifest when the segment has none', () => {
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [0, 2], {
        type: 'MediaSegment',
        manifest: null,
        interval: [0, 2],
        valid: true,
      });
      const streamManifest = { label: 'stream-manifest', instanceId: null } as C2paManifest;
      const { tracker } = buildTracker(timeIndex, 'rep1', streamManifest);

      const status = tracker.queryStatusAtTime(1);
      expect(status.details.video?.manifest).toBe(streamManifest);
      expect(status.details.video?.verified).toBe(true);
    });

    it('returns verified=undefined when neither segment nor stream has a manifest', () => {
      const timeIndex = new TimeIntervalIndex();
      timeIndex.insert('video-rep1', [0, 2], {
        type: 'MediaSegment',
        manifest: null,
        interval: [0, 2],
        valid: true,
      });
      const { tracker } = buildTracker(timeIndex, 'rep1', null);

      const status = tracker.queryStatusAtTime(1);
      expect(status.details.video?.manifest).toBeNull();
      expect(status.details.video?.verified).toBeUndefined();
    });

    it('skips a media type when its quality is null', () => {
      const timeIndex = new TimeIntervalIndex();
      const { tracker } = buildTracker(timeIndex, null);
      // With quality=null the tracker skips the stream; no lookup occurs
      const status = tracker.queryStatusAtTime(1);
      expect(status.verified).toBeUndefined();
      expect(status.details).toEqual({});
    });
  });
});
