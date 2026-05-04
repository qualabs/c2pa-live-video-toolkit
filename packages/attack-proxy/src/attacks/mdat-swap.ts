import fs from 'fs';
import type { SessionState, AttackResult } from '../types.js';
import { MDAT_SWAP_SOURCE_PATH } from '../config.js';
import { fetchFromOrigin } from '../proxy/fetchFromOrigin.js';
import { proxySegment } from '../proxy/segment-proxy.js';
import { buildSwappedSegment } from '../mp4/buildSwappedSegment.js';
import { logger, errorMessage } from '../utils/logger.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function applyMdatSwapAttack(
  session: SessionState,
  n: number,
  streamId: string,
): AttackResult | null {
  // Only fire the mdat-swap on the lowest observed stream (video stream 0).
  // Audio requests arrive first and would otherwise steal the attack target.
  const targetStream = session.lowestObservedStreamId;
  if (targetStream !== null && streamId !== targetStream) {
    return null;
  }

  if (session.mdatAttackAt === null) {
    session.mdatAttackAt = session.lastSeenSegment !== null ? session.lastSeenSegment + 1 : n;
  }
  if (session.mdatAttackAt === n) {
    session.pendingMoofTamper = false;
    session.mdatAttackAt = null;
    session.attackConfig.enabled = false;
    session.attackConfig.type = 'none';
    return { targetSegment: n, swapMdat: true };
  }
  return null;
}

export async function proxyWithContentSwap(
  req: IncomingMessage,
  res: ServerResponse,
  targetPath: string,
  currentSegNum: number,
  streamId: string,
): Promise<void> {
  try {
    const response = await fetchFromOrigin(targetPath);

    if (response.statusCode !== 200) {
      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
      return;
    }

    let swapFileBytes: Buffer;
    try {
      swapFileBytes = fs.readFileSync(MDAT_SWAP_SOURCE_PATH);
    } catch (err) {
      logger.error('[MDAT-SWAP] Failed to read source file:', errorMessage(err));
      return proxySegment(req, res, targetPath, currentSegNum, streamId);
    }

    const attackedBytes = buildSwappedSegment(response.body, swapFileBytes, currentSegNum);

    if (!attackedBytes) {
      return proxySegment(req, res, targetPath, currentSegNum, streamId);
    }

    const headers = { ...response.headers, 'Content-Length': attackedBytes.length.toString() };
    delete headers['content-encoding'];

    res.writeHead(response.statusCode, headers);
    res.end(attackedBytes);
  } catch (err) {
    logger.error('[MDAT-SWAP] Content swap error:', errorMessage(err));
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
}
