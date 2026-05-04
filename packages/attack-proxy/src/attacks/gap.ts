import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import type { ServerResponse } from 'http';

// How long after the first gap fire we accept late streams (covers ~1 segment duration plus
// network variance but expires before the GapController ABR switch ~8 s later).
const GAP_WINDOW_MS = 6_000;

export function applyGapAttack(
  session: SessionState,
  streamId: string,
  segmentNumber: number,
  noAttack: AttackResult,
): AttackResult | null {
  if (!session.pendingGap) return null;
  if (session.gapFiredStreams.has(streamId)) return null;

  const now = Date.now();

  if (session.gapFiredAtSegment !== null) {
    const elapsed = now - (session.gapFiredAtTimestamp ?? now);
    const segmentRange = segmentNumber - session.gapFiredAtSegment;
    // Only gap streams at the exact same segment number. Video now goes through the proxy
    // on every request (no-store cache control), so N+1 in-flight catch-up is not needed.
    // The time window is a safety net against stale re-fires.
    if (elapsed > GAP_WINDOW_MS || segmentRange !== 0) {
      return null;
    }
  } else {
    // No pre-armed target: first stream determines the gap segment.
    session.gapFiredAtSegment = segmentNumber;
  }

  // Lazy timestamp — set on the first stream that actually fires (covers both the
  // pre-armed and the first-stream-sets-it paths).
  if (session.gapFiredAtTimestamp === null) {
    session.gapFiredAtTimestamp = now;
  }

  session.gapFiredStreams.add(streamId);
  return { ...noAttack, gapEmptySegment: true };
}

export function proxyGapEmptySegment(
  res: ServerResponse,
  _info: SegmentInfo,
  _attack: AttackResult,
): void {
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': 0 });
  res.end();
}
