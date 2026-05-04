import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { state } from '../state.js';
import { fetchSegment, proxySegment, buildSegmentPath, cacheKey } from '../proxy/segment-proxy.js';
import { extractMoofMdat, replaceMoofMdat } from '../mp4/mdat-utils.js';
import {
  setMfhdSequenceNumber,
  setBaseMediaDecodeTimeInMoof,
  getBaseMediaDecodeTimeFromMoof,
} from '../mp4/moof-utils.js';
import { logger } from '../utils/logger.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function applyReplayAttack(
  session: SessionState,
  n: number,
  streamId: string,
  noAttack: AttackResult,
): AttackResult | null {
  const { attackConfig, guards, contentCache } = session;

  if (!guards.replay) {
    const targetStream = session.lowestObservedStreamId;
    if (targetStream !== null && streamId !== targetStream) {
      return noAttack;
    }

    // replayFrom = n (the arming slot itself): the arm passes n through and caches it for all
    // streams. By the time n+1 arrives, every stream has n cached — avoiding the race where
    // stream3 hadn't requested n-1 yet and the cache would miss.
    const replayFrom = n;
    const attackAt = n + 1;
    if (n >= 2) {
      attackConfig.replaySegment = replayFrom;
      attackConfig.replayStreamId = streamId;
      attackConfig._attackSegment = attackAt;
      guards.replay = true;
      logger.info(`[REPLAY] ARMED — stream=${streamId}, seg ${n} passes through; seg ${attackAt} will replay seg ${replayFrom}`);
    }
    return noAttack;
  }

  if (
    attackConfig.replaySegment === null ||
    attackConfig.replayStreamId === null ||
    attackConfig._attackSegment === null
  ) {
    return null;
  }

  if (n === attackConfig._attackSegment) {
    const key = cacheKey(streamId, attackConfig.replaySegment);
    if (contentCache.has(key)) {
      if (streamId === attackConfig.replayStreamId) {
        // Primary stream fired — disable so future primary-stream requests pass through normally.
        attackConfig.enabled = false;
      }
      return {
        ...noAttack,
        replayAttack: true,
        replayFrom: attackConfig.replaySegment,
        slotNumber: n,
        replayIsPrimary: streamId === attackConfig.replayStreamId,
      };
    }
  }

  return null;
}

export async function proxyReplayAttack(
  req: IncomingMessage,
  res: ServerResponse,
  info: SegmentInfo,
  attack: AttackResult,
): Promise<void> {
  if (attack.replayFrom == null || attack.slotNumber == null) {
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number, info.streamId);
  }

  const key = cacheKey(info.streamId, attack.replayFrom);
  const cached = state.contentCache.get(key);
  if (!cached?.full) {
    logger.error(`[REPLAY] No cached full segment for ${key}`);
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number, info.streamId);
  }

  const slotTfdtBytes = await fetchSegment(attack.slotNumber, info);
  const slotContent = extractMoofMdat(slotTfdtBytes);
  const tfdt = slotContent ? getBaseMediaDecodeTimeFromMoof(slotContent.moof) : null;

  if (tfdt == null) {
    logger.warn('[REPLAY] Could not extract TFDT from slot segment — passing through');
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number, info.streamId);
  }

  let moof = Buffer.from(setMfhdSequenceNumber(cached.moof, attack.slotNumber));
  moof = Buffer.from(setBaseMediaDecodeTimeInMoof(moof, tfdt));
  const newBytes = Buffer.from(replaceMoofMdat(cached.full, moof, cached.mdat));

  res.writeHead(200, { 'Content-Type': 'video/iso4', 'Content-Length': newBytes.length });
  res.end(newBytes);
}
