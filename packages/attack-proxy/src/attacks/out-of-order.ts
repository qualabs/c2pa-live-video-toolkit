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
    return noAttack;
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
    let bBytes: Buffer;
    let aBytes: Buffer;
    try {
      [bBytes, aBytes] = await Promise.all([
        fetchSegment(asSlot, info),
        fetchSegment(serveContentOf, info),
      ]);
    } catch (err) {
      logger.warn(`[REORDER] Segment not available, cancelling attack: ${errorMessage(err)}`);
      state.attackConfig.reorderSeg1 = null;
      state.attackConfig.reorderSeg2 = null;
      state.attackConfig.enabled = false;
      return proxySegment(req, res, buildSegmentPath(info, info.number), info.number);
    }
    cacheContent(asSlot, bBytes);
    cacheContent(serveContentOf, aBytes);
    segBMoofMdat = extractMoofMdat(bBytes);
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
