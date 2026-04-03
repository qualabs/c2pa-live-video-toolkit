/**
 * Repository for direct access to segment data in memory
 * Encapsulates direct access to the store
 */

import { segmentStore, Job, SegmentData, ManifestQueueItem } from './store.js';

export class SegmentRepository {
  getSegmentPattern(repId: string): string | undefined {
    return segmentStore.segmentPatterns.get(repId);
  }

  setSegmentPattern(repId: string, pattern: string): void {
    segmentStore.segmentPatterns.set(repId, pattern);
  }

  getInitPattern(repId: string): string | undefined {
    return segmentStore.initPatterns.get(repId);
  }

  setInitPattern(repId: string, pattern: string): void {
    segmentStore.initPatterns.set(repId, pattern);
  }

  getAllRepresentationIds(): string[] {
    return Array.from(segmentStore.segmentPatterns.keys());
  }

  getLastProcessed(repId: string): number | undefined {
    return segmentStore.lastProcessed.get(repId);
  }

  setLastProcessed(repId: string, segmentNumber: number): void {
    segmentStore.lastProcessed.set(repId, segmentNumber);
  }

  hasLastProcessed(repId: string): boolean {
    return segmentStore.lastProcessed.has(repId);
  }

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

  clearReadyList(repId: string): void {
    segmentStore.readyLists.set(repId, []);
  }

  clearWaitingSet(repId: string): void {
    segmentStore.waitingSets.set(repId, new Set<string>());
  }

  clearManifestState(): void {
    segmentStore.manifestQueue.length = 0;
    segmentStore.manifestContent.clear();
    segmentStore.manifestRequirements.clear();
    segmentStore.manifestEnqueued.clear();
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

  getManifestContent(publishTime: string): string | undefined {
    return segmentStore.manifestContent.get(publishTime);
  }

  setManifestContent(publishTime: string, content: string): void {
    segmentStore.manifestContent.set(publishTime, content);
  }

  deleteManifestContent(publishTime: string): void {
    segmentStore.manifestContent.delete(publishTime);
  }

  getManifestRequirements(publishTime: string): Record<string, number> | undefined {
    return segmentStore.manifestRequirements.get(publishTime);
  }

  setManifestRequirements(publishTime: string, requirements: Record<string, number>): void {
    segmentStore.manifestRequirements.set(publishTime, requirements);
  }

  deleteManifestRequirements(publishTime: string): void {
    segmentStore.manifestRequirements.delete(publishTime);
  }

  getManifestQueue(): ManifestQueueItem[] {
    return segmentStore.manifestQueue;
  }

  addToManifestQueue(item: ManifestQueueItem): void {
    segmentStore.manifestQueue.unshift(item);
  }

  removeFromManifestQueue(publishTime: string): void {
    const index = segmentStore.manifestQueue.findIndex((m) => m.publishTime === publishTime);
    if (index !== -1) {
      segmentStore.manifestQueue.splice(index, 1);
    }
  }

  isManifestEnqueued(publishTime: string): boolean {
    return segmentStore.manifestEnqueued.has(publishTime);
  }

  addToManifestEnqueued(publishTime: string): void {
    segmentStore.manifestEnqueued.add(publishTime);
  }

  removeFromManifestEnqueued(publishTime: string): void {
    segmentStore.manifestEnqueued.delete(publishTime);
  }

  getMpdPollingInterval(): number {
    return segmentStore.mpdPollingInterval;
  }

  setMpdPollingInterval(interval: number): void {
    segmentStore.mpdPollingInterval = interval;
  }

  clearPreviousManifestId(repId: string): void {
    segmentStore.previousManifestIds.delete(repId);
  }

  getPreviousSignedSegmentPath(repId: string): string | undefined {
    return segmentStore.previousSignedSegmentPaths.get(repId);
  }

  setPreviousSignedSegmentPath(repId: string, segmentPath: string): void {
    segmentStore.previousSignedSegmentPaths.set(repId, segmentPath);
  }

  clearPreviousSignedSegmentPath(repId: string): void {
    segmentStore.previousSignedSegmentPaths.delete(repId);
  }
}
