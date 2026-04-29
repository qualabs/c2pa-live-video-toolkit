import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { state } from '../state.js';
import {
  fetchSegment,
  cacheContent,
  buildSegmentPath,
  proxySegment,
} from '../proxy/segment-proxy.js';
import { extractMoofMdat, replaceMoofMdat } from '../mp4/mdat-utils.js';
import {
  setMfhdSequenceNumber,
  setBaseMediaDecodeTimeInMoof,
  getBaseMediaDecodeTimeFromMoof,
} from '../mp4/moof-utils.js';
import { logger, errorMessage } from '../utils/logger.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function applyOutOfOrderAttack(
  session: SessionState,
  n: number,
  noAttack: AttackResult,
): AttackResult | null {
  const { attackConfig, guards } = session;

  if (!guards.reorder) {
    attackConfig.reorderSeg1 = n + 1;
    attackConfig.reorderSeg2 = n + 2;
    guards.reorder = true;
    logger.info(`OUT-OF-ORDER: Armed for seg ${n + 1} and ${n + 2}`);
    return { ...noAttack, prefetchSegment: n + 2 };
  }

  if (attackConfig.reorderSeg1 === null || attackConfig.reorderSeg2 === null) return null;

  if (n === attackConfig.reorderSeg1) {
    logger.info(`OUT-OF-ORDER [1/2]: serve seg ${attackConfig.reorderSeg2} content as slot ${n}`);
    return {
      ...noAttack,
      reorderAttack: true,
      serveContentOf: attackConfig.reorderSeg2,
      asSlot: n,
    };
  }
  if (n === attackConfig.reorderSeg2) {
    attackConfig.enabled = false;
    logger.info(`OUT-OF-ORDER [2/2]: serve seg ${attackConfig.reorderSeg1} content as slot ${n}`);
    return {
      ...noAttack,
      reorderAttack: true,
      serveContentOf: attackConfig.reorderSeg1,
      asSlot: n,
    };
  }

  return null;
}

export async function proxyReorderAttack(
  req: IncomingMessage,
  res: ServerResponse,
  info: SegmentInfo,
  attack: AttackResult,
): Promise<void> {
  if (attack.asSlot == null || attack.serveContentOf == null) {
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
  }

  const { asSlot, serveContentOf } = attack;
  const isFirst = asSlot === state.attackConfig.reorderSeg1;

  let segAFull: Buffer;
  let segAMoof: Uint8Array;
  let segAMdat: Uint8Array;
  let segBMoofMdat: ReturnType<typeof extractMoofMdat>;

  if (isFirst) {
    // Fetch the current segment (asSlot = N+1) — always available since the player requested it
    let bBytes: Buffer;
    try {
      bBytes = await fetchSegment(asSlot, info);
    } catch (err) {
      logger.warn(`[REORDER] Current segment unavailable, cancelling attack: ${errorMessage(err)}`);
      state.attackConfig.reorderSeg1 = null;
      state.attackConfig.reorderSeg2 = null;
      state.attackConfig.enabled = false;
      return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
    }
    cacheContent(asSlot, bBytes);
    segBMoofMdat = extractMoofMdat(bBytes);

    // Use the pre-fetched N+2 from cache; fall back to a single fetch attempt
    const cachedFuture = state.contentCache.get(serveContentOf);
    let aBytes: Buffer;
    if (cachedFuture?.full) {
      aBytes = cachedFuture.full;
      logger.info(`[REORDER] Using pre-fetched segment ${serveContentOf} from cache`);
    } else {
      try {
        aBytes = await fetchSegment(serveContentOf, info);
        cacheContent(serveContentOf, aBytes);
      } catch (err) {
        logger.warn(`[REORDER] Future segment ${serveContentOf} not ready, cancelling attack: ${errorMessage(err)}`);
        state.attackConfig.reorderSeg1 = null;
        state.attackConfig.reorderSeg2 = null;
        state.attackConfig.enabled = false;
        return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
      }
    }

    const aContent = extractMoofMdat(aBytes);
    if (!aContent) {
      return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
    }
    segAFull = aBytes;
    segAMoof = aContent.moof;
    segAMdat = aContent.mdat;
  } else {
    const cachedA = state.contentCache.get(serveContentOf);
    const cachedB = state.contentCache.get(asSlot);
    if (!cachedA?.full || !cachedB) {
      logger.error(`[REORDER] Missing cache for ${serveContentOf} or ${asSlot}`);
      return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
    }
    segAFull = cachedA.full;
    segAMoof = cachedA.moof;
    segAMdat = cachedA.mdat;
    segBMoofMdat = extractMoofMdat(cachedB.full);
  }

  const tfdt = segBMoofMdat ? getBaseMediaDecodeTimeFromMoof(segBMoofMdat.moof) : null;
  if (tfdt == null) {
    logger.warn('[REORDER] Could not get tfdt, passing through');
    return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
  }

  let moof = Buffer.from(setMfhdSequenceNumber(segAMoof, asSlot));
  moof = Buffer.from(setBaseMediaDecodeTimeInMoof(moof, tfdt));
  const newBytes = Buffer.from(replaceMoofMdat(segAFull, moof, segAMdat));

  res.writeHead(200, { 'Content-Type': 'video/iso4', 'Content-Length': newBytes.length });
  res.end(newBytes);
}
