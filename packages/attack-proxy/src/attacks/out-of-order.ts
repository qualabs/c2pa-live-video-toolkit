import type { SessionState, SegmentInfo, AttackResult } from '../types.js';
import { state } from '../state.js';
import {
  fetchSegment,
  cacheContent,
  buildSegmentPath,
  proxySegment,
  cacheKey,
} from '../proxy/segment-proxy.js';
import { extractMoofMdat, replaceMoofMdat } from '../mp4/mdat-utils.js';
import {
  setMfhdSequenceNumber,
  setBaseMediaDecodeTimeInMoof,
  getBaseMediaDecodeTimeFromMoof,
} from '../mp4/moof-utils.js';
import { logger, errorMessage } from '../utils/logger.js';
import type { IncomingMessage, ServerResponse } from 'http';

// Strategy: forward reorder — slot N+1 gets seg N+2's content, slot N+2 gets seg N+1's content.
// The CML library sees seq N+2 where it expects N+1 → OUT_OF_ORDER → REORDERED status.
//
// N+2 is not yet available when N+1 is requested (live edge), so isFirst polls the cache
// until the background prefetch populates it (up to POLL_TIMEOUT_MS).
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
    logger.info(
      `[${new Date().toISOString()}] OUT-OF-ORDER: Armed — ` +
        `slot ${n + 1} → seg ${n + 2} content; slot ${n + 2} → seg ${n + 1} content`,
    );
    return { ...noAttack, prefetchSegment: n + 2 };
  }

  if (attackConfig.reorderSeg1 === null || attackConfig.reorderSeg2 === null) return null;

  if (n === attackConfig.reorderSeg1) {
    logger.info(
      `[${new Date().toISOString()}] OUT-OF-ORDER [1/2]: slot ${n} → serving seg ${attackConfig.reorderSeg2} content`,
    );
    return {
      ...noAttack,
      reorderAttack: true,
      serveContentOf: attackConfig.reorderSeg2,
      asSlot: n,
    };
  }

  if (n === attackConfig.reorderSeg2) {
    attackConfig.enabled = false;
    logger.info(
      `[${new Date().toISOString()}] OUT-OF-ORDER [2/2]: slot ${n} → serving seg ${attackConfig.reorderSeg1} content; disabling attack`,
    );
    return {
      ...noAttack,
      reorderAttack: true,
      serveContentOf: attackConfig.reorderSeg1,
      asSlot: n,
    };
  }

  return null;
}

// Segment duration in this live stream is ~4 s. N+2 is published ~8 s after N is armed.
// We poll for up to 9 s to cover that window with a safety margin.
const POLL_INTERVAL_MS = 300;
const POLL_TIMEOUT_MS = 9000;

// Both swap slots follow the same pattern:
//   1. Fetch the requested slot from origin (for its timing; caches it for the second swap).
//   2. Load the content segment from cache (isFirst polls until it appears).
//   3. Patch the content segment's moof with the slot's timing and serve.
export async function proxyReorderAttack(
  req: IncomingMessage,
  res: ServerResponse,
  info: SegmentInfo,
  attack: AttackResult,
): Promise<void> {
  const fallback = () =>
    proxySegment(req, res, buildSegmentPath(info, info.number), info.number, info.streamId);

  if (attack.asSlot == null || attack.serveContentOf == null) {
    return fallback();
  }

  const { asSlot, serveContentOf } = attack;
  const isFirst = asSlot === state.attackConfig.reorderSeg1;
  const step = isFirst ? '1/2' : '2/2';
  const ts = () => new Date().toISOString();

  // Step 1: fetch this slot's segment from origin (for timing, and to cache it).
  logger.info(`[${ts()}] [REORDER ${step}] Slot ${asSlot}: fetching timing from seg ${asSlot}`);
  let slotBytes: Buffer;
  try {
    slotBytes = await fetchSegment(asSlot, info);
  } catch (err) {
    logger.warn(
      `[${ts()}] [REORDER ${step}] Slot ${asSlot}: fetch failed, cancelling: ${errorMessage(err)}`,
    );
    state.attackConfig.reorderSeg1 = null;
    state.attackConfig.reorderSeg2 = null;
    state.attackConfig.enabled = false;
    return fallback();
  }
  logger.info(`[${ts()}] [REORDER ${step}] Slot ${asSlot}: fetched ${slotBytes.length}B, caching`);
  cacheContent(asSlot, info.streamId, slotBytes);

  const slotMoofMdat = extractMoofMdat(slotBytes);
  const tfdt = slotMoofMdat ? getBaseMediaDecodeTimeFromMoof(slotMoofMdat.moof) : null;
  if (tfdt == null) {
    logger.warn(`[${ts()}] [REORDER ${step}] Slot ${asSlot}: could not read tfdt, passing through`);
    return fallback();
  }

  // Step 2: load the content segment from cache.
  // isFirst (slot N+1) needs N+2. The background prefetch handles the primary stream; other
  // streams (secondary audio/video) have no prefetch so we fetch directly from origin here.
  // isSecond (slot N+2) needs N+1, which was cached in step 1 of isFirst — available immediately.
  let cachedContent = state.contentCache.get(cacheKey(info.streamId, serveContentOf));
  if (!cachedContent?.full && isFirst) {
    logger.info(
      `[${ts()}] [REORDER 1/2] Slot ${asSlot}: seg ${serveContentOf} not cached ` +
        `(stream=${info.streamId}), fetching with up to ${POLL_TIMEOUT_MS}ms timeout…`,
    );
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (!cachedContent?.full && Date.now() < deadline) {
      try {
        const bytes = await fetchSegment(serveContentOf, info);
        cacheContent(serveContentOf, info.streamId, bytes);
        cachedContent = state.contentCache.get(cacheKey(info.streamId, serveContentOf));
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        cachedContent = state.contentCache.get(cacheKey(info.streamId, serveContentOf));
      }
    }
    if (cachedContent?.full) {
      logger.info(
        `[${ts()}] [REORDER 1/2] Slot ${asSlot}: seg ${serveContentOf} ready ` +
          `(${cachedContent.full.length}B, stream=${info.streamId})`,
      );
    }
  }

  // isSecond: N+1 is always published (it was signed before arming), but may have been
  // evicted from the small cache by the time isSecond runs. Fetch directly.
  if (!cachedContent?.full && !isFirst) {
    logger.info(
      `[${ts()}] [REORDER 2/2] Slot ${asSlot}: seg ${serveContentOf} not in cache, fetching from origin`,
    );
    try {
      const bytes = await fetchSegment(serveContentOf, info);
      cacheContent(serveContentOf, info.streamId, bytes);
      cachedContent = state.contentCache.get(cacheKey(info.streamId, serveContentOf));
    } catch (err) {
      logger.warn(
        `[${ts()}] [REORDER 2/2] Slot ${asSlot}: fetch of seg ${serveContentOf} failed: ${errorMessage(err)}`,
      );
    }
  }

  if (!cachedContent?.full) {
    logger.warn(
      `[${ts()}] [REORDER ${step}] Slot ${asSlot}: content seg ${serveContentOf} unavailable, cancelling`,
    );
    state.attackConfig.reorderSeg1 = null;
    state.attackConfig.reorderSeg2 = null;
    state.attackConfig.enabled = false;
    return fallback();
  }
  logger.info(
    `[${ts()}] [REORDER ${step}] Slot ${asSlot}: ` +
      `using seg ${serveContentOf} (${cachedContent.full.length}B) as content`,
  );

  const contentMoofMdat = extractMoofMdat(cachedContent.full);
  if (!contentMoofMdat) {
    logger.warn(
      `[${ts()}] [REORDER ${step}] Slot ${asSlot}: could not parse moof/mdat from seg ${serveContentOf}, passing through`,
    );
    return fallback();
  }

  // Step 3: patch content moof with slot timing and send.
  logger.info(
    `[${ts()}] [REORDER ${step}] Slot ${asSlot}: patching — mfhd seq=${asSlot}, tfdt=${tfdt}`,
  );
  let moof = Buffer.from(setMfhdSequenceNumber(contentMoofMdat.moof, asSlot));
  moof = Buffer.from(setBaseMediaDecodeTimeInMoof(moof, tfdt));
  const newBytes = Buffer.from(replaceMoofMdat(cachedContent.full, moof, contentMoofMdat.mdat));

  logger.info(
    `[${ts()}] [REORDER ${step}] Slot ${asSlot}: sending ${newBytes.length}B ` +
      `(seg ${serveContentOf} content + slot ${asSlot} timing)`,
  );
  res.writeHead(200, { 'Content-Type': 'video/iso4', 'Content-Length': newBytes.length });
  res.end(newBytes);
}
