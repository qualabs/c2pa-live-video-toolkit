import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { fetchSegment } from '../proxy/segment-proxy.js';
import { removeC2paManifestBox } from '../mp4/mdat-utils.js';
import { logger, errorMessage } from '../utils/logger.js';
import type { ServerResponse } from 'http';

export function applyGapAttack(
  session: SessionState,
  n: number,
  noAttack: AttackResult,
): AttackResult | null {
  const { attackConfig, guards } = session;

  if (session.pendingGap && session.lastSeenSegment !== null) {
    attackConfig.gapAt = session.lastSeenSegment + 1;
    session.pendingGap = false;
  }

  if (attackConfig.gapAt !== null && n === attackConfig.gapAt) {
    const firstFire = !guards.gap;
    if (firstFire) {
      guards.gap = true;
      attackConfig.enabled = false;
    }
    return { ...noAttack, gapEmptySegment: true, gapAt: n };
  }

  return null;
}

export async function proxyGapEmptySegment(
  res: ServerResponse,
  info: SegmentInfo,
  attack: AttackResult,
): Promise<void> {
  if (attack.gapAt == null) {
    res.statusCode = 500;
    res.end();
    return;
  }

  const N = attack.gapAt;
  let nBytes: Buffer;
  try {
    nBytes = await fetchSegment(N, info);
  } catch (err) {
    logger.error(`[GAP] Failed to fetch segment ${N}: ${errorMessage(err)}`);
    res.statusCode = 502;
    res.end();
    return;
  }

  // Strip only the C2PA manifest box so the validator marks this segment as
  // CONTINUITY_INVALID (gap warning). The moof+mdat are preserved intact so
  // MSE can decode the fragment and the player timeline continues to advance.
  const gapSegment = Buffer.from(removeC2paManifestBox(nBytes));
  res.writeHead(200, { 'Content-Type': 'video/iso4', 'Content-Length': gapSegment.length });
  res.end(gapSegment);
}
