import { segmentStore, Job, SegmentData } from './store.js';

/**
 * Repository for segment queue operations: ready lists, waiting sets,
 * global waiting list, and processed tracking.
 */
export class SegmentQueueRepository {
  getReadyList(repId: string): Job[] {
    return segmentStore.readyLists.get(repId) || [];
  }

  addToReadyList(repId: string, job: Job): void {
    const readyList = this.getReadyList(repId);
    readyList.unshift(job);
    segmentStore.readyLists.set(repId, readyList);
  }

  removeFromReadyList(repId: string): Job | undefined {
    const readyList = this.getReadyList(repId);
    return readyList.pop();
  }

  clearReadyList(repId: string): void {
    segmentStore.readyLists.set(repId, []);
  }

  hasInWaitingSet(repId: string, fileKey: string): boolean {
    const waitingSet = segmentStore.waitingSets.get(repId);
    return waitingSet ? waitingSet.has(fileKey) : false;
  }

  addToWaitingSet(repId: string, fileKey: string): void {
    const waitingSet = segmentStore.waitingSets.get(repId) || new Set<string>();
    waitingSet.add(fileKey);
    segmentStore.waitingSets.set(repId, waitingSet);
  }

  removeFromWaitingSet(repId: string, fileKey: string): void {
    const waitingSet = segmentStore.waitingSets.get(repId);
    if (waitingSet) {
      waitingSet.delete(fileKey);
    }
  }

  clearWaitingSet(repId: string): void {
    segmentStore.waitingSets.set(repId, new Set<string>());
  }

  addToProcessedList(repId: string, fileKey: string): void {
    const processList = segmentStore.processedLists.get(repId) || [];
    processList.unshift(fileKey);
    segmentStore.processedLists.set(repId, processList);
  }

  addToGlobalWaitingList(fileKey: string): void {
    segmentStore.globalWaitingList.add(fileKey);
  }

  removeFromGlobalWaitingList(fileKey: string): void {
    segmentStore.globalWaitingList.delete(fileKey);
  }

  getAllFromGlobalWaitingList(): string[] {
    return Array.from(segmentStore.globalWaitingList);
  }

  clearGlobalWaitingList(): void {
    segmentStore.globalWaitingList.clear();
  }

  private buildSegmentKey(repId: string, segmentId: string): string {
    return `segment:${repId}:${segmentId}`;
  }

  getSegmentData(repId: string, segmentId: string): SegmentData | undefined {
    return segmentStore.segments.get(this.buildSegmentKey(repId, segmentId));
  }

  setSegmentData(repId: string, segmentId: string, data: SegmentData): void {
    segmentStore.segments.set(this.buildSegmentKey(repId, segmentId), data);
  }
}
