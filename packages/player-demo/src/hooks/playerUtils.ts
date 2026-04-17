import { SegmentStatus } from '@c2pa-live-toolkit/dashjs-plugin';
import type { SegmentRecord } from '@c2pa-live-toolkit/dashjs-plugin';
import { DEFAULT_STREAM_URL } from '../constants.js';

/**
 * How many seconds to seek back from the end of the buffer when recovering
 * from a dash.js error (e.g. gap attack). Keeps playback within a valid range.
 */
export const SEEK_BACK_OFFSET_SECONDS = 0.05;

export function resolveStreamUrl(videoSrc?: string): string {
  if (videoSrc) return videoSrc;
  const urlParam = new URLSearchParams(window.location.search).get('url');
  return urlParam ?? DEFAULT_STREAM_URL;
}

/**
 * Synthesize a SegmentRecord for each dropped sequence number reported by the
 * detecting segment, so the UI can render missing segments as first-class rows
 * instead of attributing the gap to the segment that detected it.
 *
 * Skips any sequence number already present as MISSING in `existingSegments`
 * (same mediaType) to tolerate redundant gap reports across segments.
 *
 * Timestamps are stepped back from the detecting segment's timestamp so that
 * descending-by-timestamp sort places the synthesized rows directly below the
 * detecting segment and orders them newest→oldest by sequence number.
 */
export function buildMissingSegmentRecords(
  detectingSegment: SegmentRecord,
  existingSegments: readonly SegmentRecord[],
): SegmentRecord[] {
  const { sequenceMissingFrom: from, sequenceMissingTo: to, mediaType } = detectingSegment;
  if (from == null || to == null) return [];

  const alreadyMissing = new Set(
    existingSegments
      .filter((s) => s.mediaType === mediaType && s.status === SegmentStatus.MISSING)
      .map((s) => s.segmentNumber),
  );

  const records: SegmentRecord[] = [];
  for (let sequenceNumber = from; sequenceNumber <= to; sequenceNumber++) {
    if (alreadyMissing.has(sequenceNumber)) continue;
    const stepsFromNewest = to - sequenceNumber + 1;
    records.push({
      segmentNumber: sequenceNumber,
      mediaType,
      keyId: null,
      hash: null,
      status: SegmentStatus.MISSING,
      timestamp: detectingSegment.timestamp - stepsFromNewest,
    });
  }
  return records;
}
