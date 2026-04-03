import path from 'path';
import { Buffer } from 'buffer';
import { config } from '../config.js';
import { createStorage } from '../services/storage/storageFactory.js';
import { SegmentService } from '../services/segment.js';
import { ManifestService } from '../services/ManifestService.js';
import { StreamStateService } from '../services/StreamStateService.js';
import { parseISODurationToMs } from '../utils/parseISODuration.js';
import { extractSegmentInfo } from '../utils/segment.js';
import { startProcessingLoop, checkWaitingList } from '../segment/queue.js';
import { Job } from '../data/store.js';
import { MpdParser } from './MpdParser.js';
import { MpdFetcher } from './MpdFetcher.js';
import { InitSegmentPreparer } from './InitSegmentPreparer.js';
import { REPRESENTATION_ID_PLACEHOLDER } from '../constants.js';
import { logger } from '../utils/logger.js';
import type { AdaptationSet, Representation, SegmentTemplate, SegmentTimeline } from './types.js';

const DEFAULT_POLLING_INTERVAL_MS = 12000;

const storage = createStorage();
const mpdParser = new MpdParser();
const mpdFetcher = new MpdFetcher(storage);
const initSegmentPreparer = new InitSegmentPreparer(storage);

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function countSegmentsInTimeline(timeline: SegmentTimeline): number {
  const segments = toArray(timeline.S);
  return segments.reduce((count, segment) => count + 1 + parseInt(segment['@_r'] || '0', 10), 0);
}

function buildSegmentKey(
  baseDirPrefix: string,
  mediaTemplate: string,
  repId: string,
  index: number,
): string {
  return path.posix.join(
    baseDirPrefix,
    mediaTemplate
      .replace(REPRESENTATION_ID_PLACEHOLDER, repId)
      .replace(/\$Number(?:%0(\d+)d)?\$/, (_: string, pad: string) =>
        pad ? String(index).padStart(parseInt(pad, 10), '0') : String(index),
      ),
  );
}

function extractSegmentTemplate(adaptationSet: AdaptationSet): SegmentTemplate {
  if (adaptationSet.SegmentTemplate) return adaptationSet.SegmentTemplate;
  const firstRep = Array.isArray(adaptationSet.Representation)
    ? adaptationSet.Representation[0]
    : adaptationSet.Representation;
  if (!firstRep.SegmentTemplate) {
    throw new Error('No SegmentTemplate found in AdaptationSet or Representation');
  }
  return firstRep.SegmentTemplate;
}

async function onNewFile(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  fileKey: string,
  receivedTimestamp?: number,
): Promise<void> {
  logger.info(`New file received: ${fileKey}`);

  const repIds = streamStateService.getAllRepresentationIds();
  if (repIds.length === 0) {
    segmentService.addToGlobalWaitingList(fileKey);
    return;
  }

  const { segmentPattern, initPattern } = streamStateService.getSegmentPatterns(repIds[0]);
  if (!segmentPattern || !initPattern) {
    logger.error('Patterns not found, cannot process file:', fileKey);
    return;
  }

  const segmentInfo = extractSegmentInfo(fileKey, segmentPattern);
  if (!segmentInfo) {
    logger.error(`Could not extract segment ID from file: ${fileKey}`);
    return;
  }

  const { repId, segmentId } = segmentInfo;
  const startNumber = 1;
  const segmentNumber = parseInt(segmentId.match(/\d+$/)?.[0] || '0', 10);

  const result = segmentService.processNewSegment(
    repId,
    fileKey,
    segmentNumber,
    startNumber,
    receivedTimestamp,
  );

  if (result === 'enqueued') {
    await checkWaitingList(segmentService, repId, segmentPattern, startNumber);
  } else if (result === 'ignored') {
    logger.info(`Ignoring old or duplicate segment: ${fileKey}`);
  }
}

async function enqueueNewSegmentsFromTimeline(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  repId: string,
  timeline: SegmentTimeline,
  segmentTemplate: SegmentTemplate,
  baseDirPrefix: string,
  startNumber: number,
  receivedTimestamp: number,
): Promise<void> {
  const segments = toArray(timeline.S);
  let currentIndex = startNumber;

  for (const segment of segments) {
    const repeat = parseInt(segment['@_r'] || '0', 10);

    for (let i = 0; i <= repeat; i++) {
      const lastProcessedIndex = streamStateService.getLastProcessedOrDefault(
        repId,
        startNumber - 1,
      );

      if (currentIndex > lastProcessedIndex) {
        const segmentKey = buildSegmentKey(
          baseDirPrefix,
          segmentTemplate['@_media'],
          repId,
          currentIndex,
        );
        logger.info(`[${repId}] New segment detected #${currentIndex}: ${segmentKey}`);
        await onNewFile(segmentService, streamStateService, segmentKey, receivedTimestamp);
      }

      currentIndex++;
    }
  }
}

function logRepresentationDebugInfo(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  repId: string,
  segmentCountInWindow: number,
  startNumber: number,
): void {
  const lastProcessedIndex = streamStateService.getLastProcessedOrDefault(repId, startNumber - 1);
  const readyList = segmentService.getReadyList(repId);
  const pendingCount = readyList.length;

  logger.debug(
    `[Manifest] Rep [${repId}]: Requires up to #${segmentCountInWindow}. Last processed is #${lastProcessedIndex}.`,
  );

  if (pendingCount > 0) {
    const pendingFiles = readyList.map((job: Job) => job.fileKey);
    logger.debug(
      `           -> Waiting in queue Rep[${repId}] (${pendingCount}): [${pendingFiles.join(', ')}]`,
    );
  }
}

async function processRepresentation(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  representation: Representation,
  segmentTemplate: SegmentTemplate,
  media: string,
  init: string,
  baseDirPrefix: string,
  startNumber: number,
  receivedTimestamp: number,
  requirements: Record<string, number>,
): Promise<boolean> {
  const repId: string = representation['@_id'];
  const timeline = segmentTemplate.SegmentTimeline;
  const maxSegmentInTimeline = timeline?.S
    ? startNumber + countSegmentsInTimeline(timeline) - 1
    : startNumber - 1;

  let streamStateReset = false;
  if (streamStateService.isStreamReset(repId, maxSegmentInTimeline)) {
    logger.info(
      `Stream reset detected for ${repId} (maxInTimeline=${maxSegmentInTimeline}), clearing state so new segments are signed.`,
    );
    streamStateService.resetRepresentationState(repId, startNumber);
    streamStateReset = true;
  }

  if (timeline?.S) {
    const segmentCountInWindow = countSegmentsInTimeline(timeline);
    requirements[repId] = segmentCountInWindow;

    logRepresentationDebugInfo(
      segmentService,
      streamStateService,
      repId,
      segmentCountInWindow,
      startNumber,
    );
  }

  streamStateService.setSegmentPatterns(repId, media, init);
  streamStateService.initializeLastProcessedIfNeeded(repId, startNumber);
  await initSegmentPreparer.prepareForRepresentation(repId, init);

  if (timeline?.S) {
    await enqueueNewSegmentsFromTimeline(
      segmentService,
      streamStateService,
      repId,
      timeline,
      segmentTemplate,
      baseDirPrefix,
      startNumber,
      receivedTimestamp,
    );
  }

  await checkWaitingList(segmentService, repId, media, startNumber);
  startProcessingLoop(segmentService, streamStateService, repId);

  return streamStateReset;
}

async function processAdaptationSets(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  adaptationSets: AdaptationSet[],
  baseDirPrefix: string,
  receivedTimestamp: number,
  requirements: Record<string, number>,
): Promise<void> {
  for (const adaptationSet of adaptationSets) {
    const segmentTemplate = extractSegmentTemplate(adaptationSet);
    const media = path.posix.join(baseDirPrefix, segmentTemplate['@_media']);
    logger.debug(
      `[manifest] SegmentTemplate @_initialization: ${segmentTemplate['@_initialization']}`,
    );
    const init = path.posix.join(baseDirPrefix, segmentTemplate['@_initialization']);
    logger.debug(`[manifest] Extracted init pattern: ${init}`);
    const startNumber = parseInt(segmentTemplate['@_startNumber'], 10);
    const representations = toArray(adaptationSet.Representation);

    let streamStateReset = false;
    for (const representation of representations) {
      const wasReset = await processRepresentation(
        segmentService,
        streamStateService,
        representation,
        segmentTemplate,
        media,
        init,
        baseDirPrefix,
        startNumber,
        receivedTimestamp,
        requirements,
      );
      streamStateReset = streamStateReset || wasReset;
    }

    if (streamStateReset) {
      streamStateService.resetStreamState();
    }
  }
}

async function onManifestReceived(
  segmentService: SegmentService,
  manifestService: ManifestService,
  streamStateService: StreamStateService,
  bucket: string,
  key: string,
  receivedTimestamp: number,
): Promise<void> {
  try {
    const mpdXml = await storage.getObjectAsString(bucket, key);
    if (!mpdXml || mpdXml.trim() === '') {
      logger.error('Failed to download or empty MPD file:', key);
      return;
    }

    let parsed: ReturnType<MpdParser['parse']>;
    try {
      parsed = mpdParser.parse(mpdXml);
    } catch {
      logger.warn(`Skipping corrupt manifest file '${key}'. It might be incomplete.`);
      return;
    }

    const publishTime = mpdParser.extractPublishTime(parsed);
    if (!publishTime) {
      logger.error('Manifest is missing publishTime, cannot process.', key);
      return;
    }

    const adaptationSets = mpdParser.extractAdaptationSets(parsed);
    const baseDir = path.posix.dirname(key);
    const baseDirPrefix = baseDir === '.' ? '' : baseDir;
    const requirements: Record<string, number> = {};

    await processAdaptationSets(
      segmentService,
      streamStateService,
      adaptationSets,
      baseDirPrefix,
      receivedTimestamp,
      requirements,
    );

    const globalWaitingFiles = segmentService.processGlobalWaitingList();
    for (const fileKey of globalWaitingFiles) {
      await onNewFile(segmentService, streamStateService, fileKey);
    }

    manifestService.storeManifestContent(publishTime, mpdXml);
    manifestService.storeManifestRequirements(publishTime, requirements);
    const wasAdded = manifestService.enqueueManifest(publishTime, receivedTimestamp);
    if (wasAdded) {
      logger.debug(`[manifest] ${publishTime} added to queue.`);
    }
  } catch (error) {
    logger.error(`An unexpected error occurred while processing manifest ${key}:`, error);
  }
}

export async function pollMpdAndHandle(
  segmentService: SegmentService,
  manifestService: ManifestService,
  streamStateService: StreamStateService,
): Promise<void> {
  const receivedTimestamp = Date.now();

  logger.info('Awaiting first valid MPD manifest...');
  const mpdXml = await mpdFetcher.fetchValidMpd(config.inputBucket, config.mpdKey);
  logger.info('Successfully fetched MPD.');

  let nextInterval = DEFAULT_POLLING_INTERVAL_MS;

  try {
    const parsed = mpdParser.parse(mpdXml);
    const minimumUpdatePeriod = mpdParser.extractMinimumUpdatePeriod(parsed);
    if (minimumUpdatePeriod) {
      nextInterval = parseISODurationToMs(minimumUpdatePeriod);
      streamStateService.setMpdPollingInterval(nextInterval);
    }

    await onManifestReceived(
      segmentService,
      manifestService,
      streamStateService,
      config.inputBucket,
      config.mpdKey,
      receivedTimestamp,
    );
  } catch (err) {
    logger.error('Error parsing MPD, will retry polling...', err);
  }

  setTimeout(
    () => pollMpdAndHandle(segmentService, manifestService, streamStateService),
    nextInterval,
  );
}

function logManifestRepReadiness(
  streamStateService: StreamStateService,
  requirements: Record<string, number>,
  repIds: string[],
  missingReps: string[],
  publishTime: string,
): void {
  logger.debug(`[manifest] Requirements for ${publishTime}:`, requirements);

  for (const repId of repIds) {
    const requiredSegmentNumber = requirements[repId];
    const lastProcessedIndex = streamStateService.getLastProcessedOrDefault(repId, 0);
    logger.debug(
      `[manifest] Rep [${repId}]: Requires #${requiredSegmentNumber}, Last Processed is #${lastProcessedIndex}.`,
    );

    if (missingReps.includes(repId)) {
      logger.debug(`[manifest] Rep [${repId}] is NOT ready.`);
    } else {
      logger.debug(`[manifest] Rep [${repId}] is ready.`);
    }
  }
}

async function publishReadyManifest(
  manifestService: ManifestService,
  publishTime: string,
  receivedTimestamp: number,
): Promise<void> {
  logger.debug(`[manifest] ${publishTime} is fully ready. Proceeding to publish.`);

  const mpdXml = manifestService.completeManifest(publishTime);

  if (mpdXml) {
    let logMessage = `Requirements met for manifest ${publishTime}. Publishing.`;
    if (receivedTimestamp > 0) {
      logMessage += ` (took ${Date.now() - receivedTimestamp} ms from notification to publish)`;
    }
    logger.info(logMessage);
    await storage.saveObject(
      config.outputBucket,
      `processed/${config.mpdKey}`,
      Buffer.from(mpdXml),
    );
  } else {
    logger.debug(
      `[manifest] WARNING: ${publishTime} was ready, but content not found in memory. Cleaning up.`,
    );
    manifestService.removeManifest(publishTime);
  }
}

async function publishManifestIfReady(
  manifestService: ManifestService,
  streamStateService: StreamStateService,
): Promise<void> {
  const manifestsToCheck = manifestService.getManifestQueueSorted();
  if (manifestsToCheck.length === 0) return;

  logger.debug(`[manifest] Found ${manifestsToCheck.length} manifests in queue to check.`);

  for (const manifest of manifestsToCheck) {
    const { publishTime, receivedTimestamp } = manifest;
    logger.debug(`[manifest] Checking manifest with publishTime: ${publishTime}`);

    const requirements = manifestService.getManifestRequirements(publishTime);
    const repIds = requirements ? Object.keys(requirements) : [];

    if (repIds.length === 0) {
      logger.debug(
        `[manifest] No requirements found for ${publishTime}. Cleaning up orphan entry.`,
      );
      manifestService.removeManifest(publishTime);
      continue;
    }

    const { ready: manifestIsReady, missingReps } = manifestService.isManifestReady(
      publishTime,
      (repId) => streamStateService.getLastProcessedOrDefault(repId, 0),
    );

    logManifestRepReadiness(streamStateService, requirements!, repIds, missingReps, publishTime);

    if (manifestIsReady) {
      await publishReadyManifest(manifestService, publishTime, receivedTimestamp);
    } else {
      logger.debug(`[manifest] ${publishTime} is not ready yet. Leaving in queue.`);
      break;
    }
  }
}

export function startManifestPublisher(
  manifestService: ManifestService,
  streamStateService: StreamStateService,
): void {
  setInterval(async () => {
    await publishManifestIfReady(manifestService, streamStateService);
  }, config.publishManifestIntervalMs);
}
