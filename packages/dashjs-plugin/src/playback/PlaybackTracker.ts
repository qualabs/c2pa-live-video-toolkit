import type { EventBus } from '../events/EventBus.js';
import type { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import type { MediaType, PlaybackStatus, PlaybackStatusDetail, Logger, MutableRef, C2paManifest } from '../types.js';
import { PLAYBACK_SEARCH_WINDOW_SECONDS } from '../types.js';
import { buildStreamKey } from '../utils/streamKey.js';

type PlaybackTrackerDeps = {
  eventBus: EventBus;
  timeIndex: TimeIntervalIndex;
  manifest: MutableRef<C2paManifest | null>;
  currentQuality: Record<string, string | number | null>;
  supportedMediaTypes: MediaType[];
  logger: Logger;
};

type SegmentSearchResult = {
  valid: boolean;
  manifest: C2paManifest | null;
};

type StoredSegment = { interval: [number, number] };

function resolveDetailFromSegment(
  segmentManifest: C2paManifest | null,
  manifest: C2paManifest | null,
  isValid: boolean,
): PlaybackStatusDetail {
  const resolved = segmentManifest ?? manifest;

  if (!resolved) {
    return {
      verified: undefined,
      manifest: null,
      error: 'No manifest available',
    };
  }

  return {
    verified: isValid,
    manifest: resolved,
    error: isValid ? null : 'Manifest validation failed',
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

      const segment = found[0] as SegmentSearchResult;
      const detail = resolveDetailFromSegment(
        segment.manifest,
        this.deps.manifest.value,
        segment.valid,
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
