import path from 'path';
import fs from 'fs/promises';
import { config } from '../config.js';
import { createStorage } from '../services/storage/storageFactory.js';
import { SegmentService } from '../services/segment.js';
import { StreamStateService } from '../services/StreamStateService.js';
import { extractSegmentInfo } from '../utils/segment.js';
import { streamToBuffer } from '../utils/stream.js';
import { createSigningStrategy } from './signing/signingStrategyFactory.js';
import type { SigningContext } from './signing/ISigningStrategy.js';
import { TEMP_DIR, REPRESENTATION_ID_PLACEHOLDER } from '../constants.js';
import { logger } from '../utils/logger.js';

const storage = createStorage();
const signingStrategy = createSigningStrategy(config.useVsiMethod);

interface DownloadTimings {
  downloadStartAt: number;
  downloadedAt: number;
}

interface ProcessingTimings extends DownloadTimings {
  startAt: number;
  signedAt: number;
  uploadedAt: number;
}

export async function processFile(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  representationId: string,
  fileKey: string,
  receivedTimestamp?: number,
): Promise<void> {
  const filePath = `${TEMP_DIR}/${path.basename(fileKey)}`;
  const outputKey = `processed/${fileKey}`;
  const startAt = Date.now();

  try {
    logger.info(`[${representationId}] Processing segment: ${fileKey}`);

    const downloadTimings = await tryDownloadSegment(representationId, fileKey, filePath);
    if (!downloadTimings) return;

    const { segmentPattern, initPattern } = streamStateService.getSegmentPatterns(representationId);
    const segmentNumber = parseSegmentNumber(representationId, fileKey, segmentPattern);
    if (segmentNumber === null) return;

    const signingContext = buildSigningContext(representationId, filePath, initPattern, streamStateService);
    const { signedSegmentPath, signedInitPath } = await signingStrategy.sign(signingContext);
    const signedAt = Date.now();
    logger.info(`[${representationId}] Signing completed (${signedAt - downloadTimings.downloadedAt}ms)`);

    await cleanupPreviousSignedSegment(signingContext.previousSegmentPath);
    streamStateService.storePreviousSignedSegmentPath(representationId, signedSegmentPath);

    await uploadSignedFiles(representationId, outputKey, signedSegmentPath, signedInitPath, signingContext);
    const uploadedAt = Date.now();

    segmentService.markSegmentAsProcessed(representationId, fileKey);
    logPerformanceMetrics(representationId, segmentNumber, fileKey, {
      startAt,
      ...downloadTimings,
      signedAt,
      uploadedAt,
    }, receivedTimestamp);
  } finally {
    await cleanupTempFile(filePath);
  }
}

async function tryDownloadSegment(
  representationId: string,
  fileKey: string,
  filePath: string,
): Promise<DownloadTimings | null> {
  const downloadStartAt = Date.now();
  logger.info(`[${representationId}] Downloading segment from ${config.inputBucket}...`);
  try {
    const fileStream = await storage.getObject(config.inputBucket, fileKey);
    const buffer = await streamToBuffer(fileStream);
    await fs.writeFile(filePath, buffer);
    const downloadedAt = Date.now();
    logger.info(
      `[${representationId}] Download completed (${downloadedAt - downloadStartAt}ms, ${(buffer.length / 1024).toFixed(2)}KB)`,
    );
    return { downloadStartAt, downloadedAt };
  } catch (error) {
    if (error instanceof Error && 'name' in error && error.name === 'NoSuchKey') {
      logger.error(`File not found in storage: ${fileKey}`);
      return null;
    }
    logger.error(`Error downloading file from storage: ${fileKey}`, error);
    throw error;
  }
}

function parseSegmentNumber(
  representationId: string,
  fileKey: string,
  segmentPattern: string | null,
): number | null {
  if (!segmentPattern) {
    throw new Error(`Could not find segment pattern for ${representationId}`);
  }
  const segmentInfo = extractSegmentInfo(fileKey, segmentPattern);
  if (!segmentInfo) {
    logger.error(`Could not extract segment ID from file: ${fileKey}`);
    return null;
  }
  const segmentNumber = parseInt(segmentInfo.segmentId.replace(/\D/g, ''), 10);
  logger.info(`[${representationId}] Segment #${segmentNumber} (ID: ${segmentInfo.segmentId})`);
  return segmentNumber;
}

function buildSigningContext(
  representationId: string,
  filePath: string,
  initPattern: string | null,
  streamStateService: StreamStateService,
): SigningContext {
  const previousSegmentPath = streamStateService.getPreviousSignedSegmentPath(representationId);
  return {
    representationId,
    filePath,
    initPattern,
    previousSegmentPath: previousSegmentPath ?? undefined,
    isFirstSegment: !previousSegmentPath,
  };
}

async function cleanupPreviousSignedSegment(previousSegmentPath: string | undefined): Promise<void> {
  if (previousSegmentPath) {
    await fs.unlink(previousSegmentPath).catch(() => {});
  }
}

async function uploadSignedFiles(
  representationId: string,
  outputKey: string,
  signedSegmentPath: string,
  signedInitPath: string | undefined,
  context: SigningContext,
): Promise<void> {
  const segmentBuffer = await fs.readFile(signedSegmentPath);
  await storage.saveObject(config.outputBucket, outputKey, segmentBuffer);

  if (signedInitPath && context.initPattern) {
    const initKey = context.initPattern.replace(REPRESENTATION_ID_PLACEHOLDER, context.representationId);
    const initBuffer = await fs.readFile(signedInitPath);
    await storage.saveObject(config.outputBucket, `processed/${initKey}`, initBuffer);
    logger.info(`[${representationId}] Signed init uploaded: processed/${initKey}`);
  }
}

function logPerformanceMetrics(
  representationId: string,
  segmentNumber: number,
  fileKey: string,
  timings: ProcessingTimings,
  receivedTimestamp?: number,
): void {
  const { startAt, downloadStartAt, downloadedAt, signedAt, uploadedAt } = timings;
  const totalTime = uploadedAt - startAt;
  logger.info(
    `[${representationId}] Segment #${segmentNumber} processed successfully (${totalTime}ms total)`,
  );
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  let logMessage = `Processed [${representationId}]: ${fileKey}`;
  if (receivedTimestamp && receivedTimestamp > 0) {
    const duration = Date.now() - receivedTimestamp;
    logMessage += ` (took ${duration} ms)`;
    const waitMs = downloadStartAt - startAt;
    const dlMs = downloadedAt - downloadStartAt;
    const signMs = signedAt - downloadedAt;
    const upMs = uploadedAt - signedAt;
    const total = uploadedAt - startAt;
    logger.debug(
      `[perf] wait=${waitMs}ms dl=${dlMs}ms sign=${signMs}ms up=${upMs}ms total=${total}ms ${fileKey}`,
    );
  }
  logger.info(logMessage);
}

async function cleanupTempFile(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch((err) => {
    if (err.code !== 'ENOENT') {
      logger.error(`Failed to delete temp file ${filePath}:`, err);
    }
  });
}
