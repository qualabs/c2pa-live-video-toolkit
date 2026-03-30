import type { SegmentRepository } from '../data/repository.js';
import { Job, SegmentData } from '../data/store.js';
import { REPRESENTATION_ID_PLACEHOLDER } from '../constants.js';

export class SegmentService {
  constructor(private readonly repository: SegmentRepository) {}

  enqueueSegment(repId: string, fileKey: string, receivedTimestamp?: number): void {
    const job: Job = {
      fileKey,
      receivedTimestamp,
      enqueueTs: Date.now(),
    };
    this.repository.addToReadyList(repId, job);
  }

  dequeueSegment(repId: string): Job | undefined {
    return this.repository.removeFromReadyList(repId);
  }

  getReadyList(repId: string): Job[] {
    return this.repository.getReadyList(repId);
  }

  peekNextJob(repId: string): Job | undefined {
    const readyList = this.getReadyList(repId);
    return readyList.length > 0 ? readyList[readyList.length - 1] : undefined;
  }

  addToWaitingSet(repId: string, fileKey: string): void {
    this.repository.addToWaitingSet(repId, fileKey);
  }

  moveFromWaitingToReady(repId: string, fileKey: string): boolean {
    if (this.repository.hasInWaitingSet(repId, fileKey)) {
      this.repository.removeFromWaitingSet(repId, fileKey);
      this.repository.addToReadyList(repId, { fileKey });
      return true;
    }
    return false;
  }

  determineSegmentAction(
    repId: string,
    segmentNumber: number,
    startNumber: number,
  ): 'enqueue' | 'wait' | 'ignore' {
    const lastProcessedIndex = this.repository.getLastProcessed(repId) ?? startNumber - 1;

    if (segmentNumber === lastProcessedIndex + 1) {
      return 'enqueue';
    } else if (segmentNumber > lastProcessedIndex + 1) {
      return 'wait';
    } else {
      return 'ignore';
    }
  }

  processNewSegment(
    repId: string,
    fileKey: string,
    segmentNumber: number,
    startNumber: number,
    receivedTimestamp?: number,
  ): 'enqueued' | 'waiting' | 'ignored' {
    const action = this.determineSegmentAction(repId, segmentNumber, startNumber);

    switch (action) {
      case 'enqueue':
        this.enqueueSegment(repId, fileKey, receivedTimestamp);
        this.repository.setLastProcessed(repId, segmentNumber);
        return 'enqueued';

      case 'wait':
        this.addToWaitingSet(repId, fileKey);
        return 'waiting';

      case 'ignore':
      default:
        return 'ignored';
    }
  }

  processWaitingList(repId: string, segmentPattern: string, startNumber: number): number {
    let movedCount = 0;
    let canContinue = true;

    while (canContinue) {
      canContinue = false;
      const lastProcessedIndex = this.repository.getLastProcessed(repId) ?? startNumber - 1;
      const nextSegmentNumber = lastProcessedIndex + 1;
      const expectedFileKey = this.buildFileKeyFromSegmentNumber(
        segmentPattern,
        repId,
        nextSegmentNumber,
      );

      if (this.moveFromWaitingToReady(repId, expectedFileKey)) {
        this.repository.setLastProcessed(repId, nextSegmentNumber);
        movedCount++;
        canContinue = true;
      }
    }

    return movedCount;
  }

  markSegmentAsProcessed(repId: string, fileKey: string): void {
    this.repository.addToProcessedList(repId, fileKey);
  }

  storeSegmentData(repId: string, segmentId: string, data: SegmentData): void {
    this.repository.setSegmentData(repId, segmentId, data);
  }

  getPreviousSegmentHashes(repId: string, segmentId: string): Partial<SegmentData> {
    const segmentNumber = parseInt(segmentId.slice(-1), 10);
    if (segmentNumber === 0) return {};

    const previousSegmentId = segmentId.replace(/.$/, (segmentNumber - 1).toString());
    return this.repository.getSegmentData(repId, previousSegmentId) || {};
  }

  addToGlobalWaitingList(fileKey: string): void {
    this.repository.addToGlobalWaitingList(fileKey);
  }

  processGlobalWaitingList(): string[] {
    const files = this.repository.getAllFromGlobalWaitingList();
    files.forEach((fileKey) => this.repository.removeFromGlobalWaitingList(fileKey));
    return files;
  }

  private buildFileKeyFromSegmentNumber(
    segmentPattern: string,
    repId: string,
    segmentNumber: number,
  ): string {
    return segmentPattern
      .replace(REPRESENTATION_ID_PLACEHOLDER, repId)
      .replace(/\$Number(?:%0(\d+)d)?\$/, (_, padding) =>
        padding
          ? segmentNumber.toString().padStart(parseInt(padding, 10), '0')
          : segmentNumber.toString(),
      );
  }
}
