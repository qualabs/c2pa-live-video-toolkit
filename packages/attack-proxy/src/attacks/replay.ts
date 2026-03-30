import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { fetchSegment, proxySegment, buildSegmentPath } from '../proxy/segment-proxy.js';
import { extractMoofMdat } from '../mp4/mdat-utils.js';
import { replaceMoofMdat } from '../mp4/mdat-utils.js';
import { setMfhdSequenceNumber, setBaseMediaDecodeTimeInMoof, getBaseMediaDecodeTimeFromMoof } from '../mp4/moof-utils.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function applyReplayAttack(session: SessionState, n: number, noAttack: AttackResult): AttackResult | null {
  const { attackConfig, guards, contentCache } = session;

  if (!guards.replay) {
    const replayFrom = n - 1;
    const attackAt = n + 1;
    if (n >= 2 && contentCache.has(replayFrom)) {
      attackConfig.replaySegment = replayFrom;
      attackConfig._attackSegment = attackAt;
      guards.replay = true;
      console.log(`REPLAY: Armed - seg ${n} normal, seg ${attackAt} will replay seg ${replayFrom}`);
    }
    return noAttack;
  }

  if (n === attackConfig._attackSegment && contentCache.has(attackConfig.replaySegment as number)) {
    attackConfig.enabled = false;
    console.log(`REPLAY: serve seg ${attackConfig.replaySegment} content as slot ${n}`);
    return { ...noAttack, replayAttack: true, replayFrom: attackConfig.replaySegment as number, slotNumber: n };
  }

  return null;
}

export async function proxyReplayAttack(
  req: IncomingMessage & { session: SessionState },
  res: ServerResponse,
  info: SegmentInfo,
  attack: AttackResult,
): Promise<void> {
  const cached = req.session.contentCache.get(attack.replayFrom as number);
  if (!cached?.full) {
    console.error(`[REPLAY] No cached full segment for ${attack.replayFrom}`);
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
  }

  const slotTfdtBytes = await fetchSegment(attack.slotNumber as number, info);
  const slotContent = extractMoofMdat(slotTfdtBytes);
  const tfdt = slotContent ? getBaseMediaDecodeTimeFromMoof(slotContent.moof) : null;

  if (tfdt == null) {
    console.warn('[REPLAY] Could not get tfdt from slot segment, passing through');
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
  }

  let moof = Buffer.from(setMfhdSequenceNumber(cached.moof, attack.slotNumber as number));
  moof = Buffer.from(setBaseMediaDecodeTimeInMoof(moof, tfdt));
  const newBytes = Buffer.from(replaceMoofMdat(cached.full, moof, cached.mdat));

  res.writeHead(200, { 'Content-Type': 'video/iso4', 'Content-Length': newBytes.length });
  res.end(newBytes);
}
