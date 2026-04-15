import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { SegmentService } from '../services/segment.js';
import { StreamStateService } from '../services/StreamStateService.js';
import { processFile } from './processor.js';
import { waitForSegmentInBucket } from '../utils/network.js';

const activeProcessors: Record<string, boolean> = {};
const prefetchMap = new Map<string, Promise<void>>();

async function prefetchNext(key: string | null) {
  if (!key) return;
  try {
    if (prefetchMap.has(key)) return; // already prefetching
    prefetchMap.set(key, waitForSegmentInBucket(key));
  } catch (error) {
    logger.debug(`[prefetch] HEAD fail for ${key}`, error);
  }
}

export function startProcessingLoop(
  segmentService: SegmentService,
  streamStateService: StreamStateService,
  repId: string,
) {
  if (activeProcessors[repId]) return;
  activeProcessors[repId] = true;

  logger.info(`Starting processing loop for repId=${repId} with prefetch`);

  const loop = async () => {
    const job = segmentService.dequeueSegment(repId);
    if (!job) {
      setTimeout(loop, config.processIntervalMs);
      return;
    }

    const queueWait = Date.now() - (job.enqueueTs ?? job.receivedTimestamp ?? Date.now());
    logger.debug(`[perf] queueWait=${queueWait}ms ${job.fileKey}`);

    const nextJob = segmentService.peekNextJob(repId);
    if (nextJob) {
      prefetchNext(nextJob.fileKey);
    }

    const wasPrefetched = !!prefetchMap.get(job.fileKey);

    try {
      if (!wasPrefetched) await waitForSegmentInBucket(job.fileKey);
      await processFile(
        segmentService,
        streamStateService,
        repId,
        job.fileKey,
        job.receivedTimestamp,
      );
    } catch (error) {
      logger.error(`Error processing file ${job.fileKey}:`, error);
      const currentList = segmentService.getReadyList(repId);
      currentList.push(job);
      logger.debug(`[prefetch] Error processing ${job.fileKey}, re-queued.`);
    } finally {
      prefetchMap.delete(job.fileKey);
    }

    setImmediate(loop);
  };

  loop();
}

export async function checkWaitingList(
  segmentService: SegmentService,
  repId: string,
  segmentPattern: string,
  startNumber: number,
) {
  const movedCount = segmentService.processWaitingList(repId, segmentPattern, startNumber);
  if (movedCount > 0) {
    logger.debug(`Moved ${movedCount} segment(s) from waiting to ready for ${repId}`);
  }
}
