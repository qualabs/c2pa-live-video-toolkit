import { logger } from '../utils/logger.js';
import { extractMoofMdat, replaceMoofMdat } from './mdat-utils.js';
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
} from './moof-utils.js';

/**
 * Builds an attacked segment by swapping the moof+mdat content from a source file
 * into the original segment, preserving the original's timing and track metadata.
 *
 * Returns null if the swap cannot be performed (missing boxes, track ID mismatch, etc.).
 */
export function buildSwappedSegment(
  originalBytes: Buffer,
  swapFileBytes: Buffer,
  currentSegNum: number,
): Buffer | null {
  const swapContent = extractMoofMdat(swapFileBytes);
  if (!swapContent?.moof || !swapContent?.mdat) {
    logger.error('[MDAT-SWAP] Failed to extract moof/mdat from source file');
    return null;
  }

  const currentContent = extractMoofMdat(originalBytes);
  if (!currentContent?.moof) {
    logger.error('[MDAT-SWAP] Failed to extract moof from current segment');
    return null;
  }

  const currentTimestamp = getBaseMediaDecodeTimeFromMoof(currentContent.moof);
  const currentTrackId = getTrackIdFromMoof(currentContent.moof);
  const injectedTrackId = getTrackIdFromMoof(swapContent.moof);

  if (currentTrackId !== null && injectedTrackId !== null && currentTrackId !== injectedTrackId) {
    logger.warn('[MDAT-SWAP] Track ID mismatch, aborting attack');
    return null;
  }

  let injectedMoof = Buffer.from(setMfhdSequenceNumber(swapContent.moof, currentSegNum));

  if (currentTimestamp !== null) {
    injectedMoof = Buffer.from(setBaseMediaDecodeTimeInMoof(injectedMoof, currentTimestamp));
  }
  if (currentTrackId !== null) {
    injectedMoof = Buffer.from(setTrackIdInMoof(injectedMoof, currentTrackId));
  }

  const injectedSampleCount = getTrunSampleCount(swapContent.moof);
  if (injectedSampleCount !== null) {
    injectedMoof = Buffer.from(setTrunSampleCount(injectedMoof, injectedSampleCount));
  }

  const injectedDurations = getTrunSampleDurations(swapContent.moof);
  if (injectedDurations && injectedDurations.length > 0) {
    injectedMoof = Buffer.from(rewriteTrunSampleDurations(injectedMoof, injectedDurations));
  }

  const injectedSampleSizes = getTrunSampleSizes(swapContent.moof);
  if (injectedSampleSizes && injectedSampleSizes.length > 0) {
    injectedMoof = Buffer.from(rewriteTrunSampleSizes(injectedMoof, injectedSampleSizes));
  }

  const attackedBytes = Buffer.from(replaceMoofMdat(originalBytes, injectedMoof, swapContent.mdat));

  const verifyContent = extractMoofMdat(attackedBytes);
  if (!verifyContent?.moof || !verifyContent?.mdat) {
    logger.error('[MDAT-SWAP] Attacked segment missing moof or mdat');
    return null;
  }

  return attackedBytes;
}
