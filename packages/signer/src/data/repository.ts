/**
 * Facade that composes the specialized repositories.
 * Existing consumers continue to use SegmentRepository unchanged.
 * New code should prefer importing the specialized repository directly.
 */

import { SegmentQueueRepository } from './SegmentQueueRepository.js';
import { ManifestRepository } from './ManifestRepository.js';
import { StreamStateRepository } from './StreamStateRepository.js';
import type { Job, SegmentData, ManifestQueueItem } from './store.js';

export class SegmentRepository {
  readonly queue = new SegmentQueueRepository();
  readonly manifest = new ManifestRepository();
  readonly streamState = new StreamStateRepository();

  // --- Stream state delegates ---

  getSegmentPattern(repId: string): string | undefined {
    return this.streamState.getSegmentPattern(repId);
  }

  setSegmentPattern(repId: string, pattern: string): void {
    this.streamState.setSegmentPattern(repId, pattern);
  }

  getInitPattern(repId: string): string | undefined {
    return this.streamState.getInitPattern(repId);
  }

  setInitPattern(repId: string, pattern: string): void {
    this.streamState.setInitPattern(repId, pattern);
  }

  getAllRepresentationIds(): string[] {
    return this.streamState.getAllRepresentationIds();
  }

  getLastProcessed(repId: string): number | undefined {
    return this.streamState.getLastProcessed(repId);
  }

  setLastProcessed(repId: string, segmentNumber: number): void {
    this.streamState.setLastProcessed(repId, segmentNumber);
  }

  hasLastProcessed(repId: string): boolean {
    return this.streamState.hasLastProcessed(repId);
  }

  getMpdPollingInterval(): number {
    return this.streamState.getMpdPollingInterval();
  }

  setMpdPollingInterval(interval: number): void {
    this.streamState.setMpdPollingInterval(interval);
  }

  getPreviousSignedSegmentPath(repId: string): string | undefined {
    return this.streamState.getPreviousSignedSegmentPath(repId);
  }

  setPreviousSignedSegmentPath(repId: string, segmentPath: string): void {
    this.streamState.setPreviousSignedSegmentPath(repId, segmentPath);
  }

  clearPreviousSignedSegmentPath(repId: string): void {
    this.streamState.clearPreviousSignedSegmentPath(repId);
  }

  getGeneration(repId: string): number {
    return this.streamState.getGeneration(repId);
  }

  incrementGeneration(repId: string): void {
    this.streamState.incrementGeneration(repId);
  }

  // --- Queue delegates ---

  getReadyList(repId: string): Job[] {
    return this.queue.getReadyList(repId);
  }

  addToReadyList(repId: string, job: Job): void {
    this.queue.addToReadyList(repId, job);
  }

  removeFromReadyList(repId: string): Job | undefined {
    return this.queue.removeFromReadyList(repId);
  }

  clearReadyList(repId: string): void {
    this.queue.clearReadyList(repId);
  }

  hasInWaitingSet(repId: string, fileKey: string): boolean {
    return this.queue.hasInWaitingSet(repId, fileKey);
  }

  addToWaitingSet(repId: string, fileKey: string): void {
    this.queue.addToWaitingSet(repId, fileKey);
  }

  removeFromWaitingSet(repId: string, fileKey: string): void {
    this.queue.removeFromWaitingSet(repId, fileKey);
  }

  clearWaitingSet(repId: string): void {
    this.queue.clearWaitingSet(repId);
  }

  getSegmentData(repId: string, segmentId: string): SegmentData | undefined {
    return this.queue.getSegmentData(repId, segmentId);
  }

  setSegmentData(repId: string, segmentId: string, data: SegmentData): void {
    this.queue.setSegmentData(repId, segmentId, data);
  }

  addToProcessedList(repId: string, fileKey: string): void {
    this.queue.addToProcessedList(repId, fileKey);
  }

  addToGlobalWaitingList(fileKey: string): void {
    this.queue.addToGlobalWaitingList(fileKey);
  }

  removeFromGlobalWaitingList(fileKey: string): void {
    this.queue.removeFromGlobalWaitingList(fileKey);
  }

  getAllFromGlobalWaitingList(): string[] {
    return this.queue.getAllFromGlobalWaitingList();
  }

  clearGlobalWaitingList(): void {
    this.queue.clearGlobalWaitingList();
  }

  // --- Manifest delegates ---

  getManifestContent(publishTime: string): string | undefined {
    return this.manifest.getManifestContent(publishTime);
  }

  setManifestContent(publishTime: string, content: string): void {
    this.manifest.setManifestContent(publishTime, content);
  }

  deleteManifestContent(publishTime: string): void {
    this.manifest.deleteManifestContent(publishTime);
  }

  getManifestRequirements(publishTime: string): Record<string, number> | undefined {
    return this.manifest.getManifestRequirements(publishTime);
  }

  setManifestRequirements(publishTime: string, requirements: Record<string, number>): void {
    this.manifest.setManifestRequirements(publishTime, requirements);
  }

  deleteManifestRequirements(publishTime: string): void {
    this.manifest.deleteManifestRequirements(publishTime);
  }

  getManifestQueue(): ManifestQueueItem[] {
    return this.manifest.getManifestQueue();
  }

  addToManifestQueue(item: ManifestQueueItem): void {
    this.manifest.addToManifestQueue(item);
  }

  removeFromManifestQueue(publishTime: string): void {
    this.manifest.removeFromManifestQueue(publishTime);
  }

  isManifestEnqueued(publishTime: string): boolean {
    return this.manifest.isManifestEnqueued(publishTime);
  }

  addToManifestEnqueued(publishTime: string): void {
    this.manifest.addToManifestEnqueued(publishTime);
  }

  removeFromManifestEnqueued(publishTime: string): void {
    this.manifest.removeFromManifestEnqueued(publishTime);
  }

  clearManifestState(): void {
    this.manifest.clearAll();
  }
}
