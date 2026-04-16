import type { EventBus } from '../events/EventBus.js';
import type { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import type { MediaType, PlaybackStatus, PlaybackStatusDetail, VerificationStatusValue, Logger, MutableRef, C2paManifest } from '../types.js';
import { PLAYBACK_SEARCH_WINDOW_SECONDS, PlaybackDiagnostic, VerificationStatus } from '../types.js';
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
    return { verified: VerificationStatus.INCONCLUSIVE, manifest: null, error: PlaybackDiagnostic.NO_MANIFEST };
  }

  return {
    verified: isValid ? VerificationStatus.VERIFIED : VerificationStatus.INVALID,
    manifest: resolved,
    error: isValid ? null : PlaybackDiagnostic.VALIDATION_FAILED,
  };
}

/**
 * Merges two nullable verification results using a pessimistic strategy:
 * - false (invalid) always wins over any other value
 * - true (valid) wins over undefined (unknown), unless current is already false
 * - undefined propagates only when nothing definitive is known yet
 */
function combineVerificationResults(
  current: VerificationStatusValue,
  incoming: VerificationStatusValue,
): VerificationStatusValue {
  if (incoming === VerificationStatus.INVALID) return VerificationStatus.INVALID;
  if (incoming === VerificationStatus.VERIFIED && current !== VerificationStatus.INVALID) return VerificationStatus.VERIFIED;
  return current === VerificationStatus.INVALID ? VerificationStatus.INVALID : VerificationStatus.INCONCLUSIVE;
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

    let verified: VerificationStatusValue = VerificationStatus.INCONCLUSIVE;
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
        details[mediaType] = { verified: VerificationStatus.INCONCLUSIVE, manifest: null, error: PlaybackDiagnostic.NO_SEGMENT_FOUND };
        isInconclusive = true;
        continue;
      }

      if (this.hasOverlappingIntervals(found)) {
        details[mediaType] = { verified: VerificationStatus.INCONCLUSIVE, manifest: null, error: PlaybackDiagnostic.AMBIGUOUS_SEGMENTS };
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

    return { verified: isInconclusive ? VerificationStatus.INCONCLUSIVE : verified, details };
  }

  private hasOverlappingIntervals(segments: StoredSegment[]): boolean {
    if (segments.length <= 1) return false;
    const first = segments[0].interval;
    return segments.some(
      (s, i) => i > 0 && s.interval[0] === first[0] && s.interval[1] === first[1],
    );
  }
}
