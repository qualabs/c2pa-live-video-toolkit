import type { SegmentRepository } from '../data/repository.js';

export class StreamStateService {
  constructor(private readonly repository: SegmentRepository) {}

  getSegmentPatterns(repId: string): { segmentPattern: string | null; initPattern: string | null } {
    return {
      segmentPattern: this.repository.getSegmentPattern(repId) || null,
      initPattern: this.repository.getInitPattern(repId) || null,
    };
  }

  setSegmentPatterns(repId: string, segmentPattern: string, initPattern: string): void {
    this.repository.setSegmentPattern(repId, segmentPattern);
    this.repository.setInitPattern(repId, initPattern);
  }

  initializeLastProcessedIfNeeded(repId: string, startNumber: number): void {
    if (!this.repository.hasLastProcessed(repId)) {
      this.repository.setLastProcessed(repId, startNumber - 1);
    }
  }

  /**
   * Detect if the stream has restarted (e.g. after ad break): our last processed index is
   * ahead of the max segment in the current MPD timeline (new cycle started from 1).
   */
  isStreamReset(repId: string, maxSegmentInTimeline: number): boolean {
    const lastProcessed = this.repository.getLastProcessed(repId);
    return lastProcessed !== undefined && lastProcessed > maxSegmentInTimeline;
  }

  /**
   * Reset per-representation state when stream restarts so new segments (from startNumber)
   * are processed and signed.
   */
  resetRepresentationState(repId: string, startNumber: number): void {
    this.repository.incrementGeneration(repId);
    this.repository.setLastProcessed(repId, startNumber - 1);
    this.repository.clearReadyList(repId);
    this.repository.clearWaitingSet(repId);
    this.repository.clearPreviousSignedSegmentPath(repId);
  }

  getGeneration(repId: string): number {
    return this.repository.getGeneration(repId);
  }

  /**
   * Clear manifest queue and global waiting list after stream reset so we don't hold
   * requirements for old segment numbers.
   */
  resetStreamState(): void {
    this.repository.clearManifestState();
    this.repository.clearGlobalWaitingList();
  }

  getAllRepresentationIds(): string[] {
    return this.repository.getAllRepresentationIds();
  }

  getLastProcessedOrDefault(repId: string, defaultValue: number): number {
    return this.repository.getLastProcessed(repId) ?? defaultValue;
  }

  getMpdPollingInterval(): number {
    return this.repository.getMpdPollingInterval();
  }

  setMpdPollingInterval(interval: number): void {
    this.repository.setMpdPollingInterval(interval);
  }

  getPreviousSignedSegmentPath(repId: string): string | undefined {
    return this.repository.getPreviousSignedSegmentPath(repId);
  }

  storePreviousSignedSegmentPath(repId: string, segmentPath: string): void {
    this.repository.setPreviousSignedSegmentPath(repId, segmentPath);
  }
}
