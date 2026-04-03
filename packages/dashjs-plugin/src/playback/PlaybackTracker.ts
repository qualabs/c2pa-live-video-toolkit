import type { EventBus } from '../events/EventBus.js';
import type { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import type { MediaType, PlaybackStatus, PlaybackStatusDetail, Logger } from '../types.js';
import { PLAYBACK_SEARCH_WINDOW_SECONDS } from '../types.js';
import { buildStreamKey } from '../utils/streamKey.js';

type PlaybackTrackerDeps = {
  eventBus: EventBus;
  timeIndex: TimeIntervalIndex;
  activeManifest: { value: unknown };
  currentQuality: Record<string, string | number | null>;
  supportedMediaTypes: MediaType[];
  logger: Logger;
};

type SegmentSearchResult = {
  valid: boolean;
  manifest: unknown;
  vsi?: unknown;
};

type StoredSegment = { interval: [number, number] };

function resolveDetailFromSegment(
  segment: SegmentSearchResult,
  activeManifest: unknown,
): PlaybackStatusDetail {
  const manifest = segment.manifest ?? activeManifest;

  if (segment.vsi !== undefined) {
    return {
      verified: segment.valid,
      manifest,
      error: segment.valid ? null : 'VSI validation failed',
    };
  }

  if (!manifest) {
    return {
      verified: undefined,
      manifest: null,
      error: 'No manifest available',
    };
  }

  return {
    verified: segment.valid,
    manifest,
    error: segment.valid ? null : 'Manifest validation failed',
  };
}

/**
 * Merges two nullable verification results using a pessimistic strategy:
 * - false (invalid) always wins over any other value
 * - true (valid) wins over undefined (unknown), unless current is already false
 * - undefined propagates only when nothing definitive is known yet
 */
function combineVerificationResults(
  current: boolean | undefined,
  incoming: boolean | undefined,
): boolean | undefined {
  if (incoming === false) return false;
  if (incoming === true && current !== false) return true;
  return current === false ? false : undefined;
}

export class PlaybackTracker {
  private readonly deps: PlaybackTrackerDeps;

  constructor(deps: PlaybackTrackerDeps) {
    this.deps = deps;
  }

  handleTimeUpdate(currentTime: number): void {
    const status = this.buildPlaybackStatus(currentTime);
    this.deps.eventBus.emit('playbackStatus', status);
  }

  queryStatusAtTime(time: number): PlaybackStatus {
    return this.buildPlaybackStatus(time);
  }

  private buildPlaybackStatus(currentTime: number): PlaybackStatus {
    const searchInterval: [number, number] = [
      currentTime,
      currentTime + PLAYBACK_SEARCH_WINDOW_SECONDS,
    ];

    let verified: boolean | undefined = undefined;
    const details: Partial<Record<MediaType, PlaybackStatusDetail>> = {};
    let isInconclusive = false;

    for (const mediaType of this.deps.supportedMediaTypes) {
      const representationId = this.deps.currentQuality[mediaType];
      if (representationId === null) continue;

      const streamKey = buildStreamKey(mediaType, representationId);
      if (!this.deps.timeIndex.hasStream(streamKey)) {
        this.deps.logger.warn(`[PlaybackTracker] No interval tree for stream key: ${streamKey}`);
        continue;
      }

      const found = this.deps.timeIndex.search(streamKey, searchInterval);

      if (found.length === 0) {
        details[mediaType] = {
          verified: undefined,
          manifest: null,
          error: `No segment found for media type ${mediaType}`,
        };
        isInconclusive = true;
        continue;
      }

      if (this.hasOverlappingIntervals(found)) {
        details[mediaType] = {
          verified: undefined,
          manifest: null,
          error: `Ambiguous: ${found.length} overlapping segments for ${mediaType}`,
        };
        isInconclusive = true;
        continue;
      }

      const detail = resolveDetailFromSegment(
        found[0] as SegmentSearchResult,
        this.deps.activeManifest.value,
      );
      details[mediaType] = detail;
      verified = combineVerificationResults(verified, detail.verified);
    }

    return {
      verified: isInconclusive ? undefined : verified,
      details,
    };
  }

  private hasOverlappingIntervals(segments: StoredSegment[]): boolean {
    if (segments.length <= 1) return false;
    const first = segments[0].interval;
    return segments.some(
      (s, i) => i > 0 && s.interval[0] === first[0] && s.interval[1] === first[1],
    );
  }
}
