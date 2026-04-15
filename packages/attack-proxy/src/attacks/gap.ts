import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { fetchSegment } from '../proxy/segment-proxy.js';
import { extractMoofMdat } from '../mp4/mdat-utils.js';
import { setMfhdSequenceNumber, setTrunSampleCount } from '../mp4/moof-utils.js';
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
    if (!guards.gap) {
      guards.gap = true;
      attackConfig.enabled = false;
    }
    console.log(`GAP: serving zero-sample segment ${n} (moof+empty mdat)`);
    return { ...noAttack, gapEmptySegment: true, gapAt: n };
  }

  return null;
}

export async function proxyGapEmptySegment(
  res: ServerResponse,
  info: SegmentInfo,
  attack: AttackResult,
): Promise<void> {
  const N = attack.gapAt as number;
  const nBytes = await fetchSegment(N, info);
  const parsed = extractMoofMdat(nBytes);

  if (!parsed?.moof) {
    console.error('[GAP] No moof in segment N');
    res.statusCode = 502;
    res.end();
    return;
  }

  let moof = Buffer.from(setMfhdSequenceNumber(parsed.moof, N));
  moof = Buffer.from(setTrunSampleCount(moof, 0));

  const emptyMdat = Buffer.alloc(8);
  emptyMdat.writeUInt32BE(8, 0);
  Buffer.from('mdat').copy(emptyMdat, 4);

  const out = Buffer.concat([moof, emptyMdat]);
  res.writeHead(200, { 'Content-Type': 'video/iso4', 'Content-Length': out.length });
  res.end(out);
}
