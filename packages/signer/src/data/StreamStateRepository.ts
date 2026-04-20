import { segmentStore } from './store.js';

/**
 * Repository for stream state: segment/init patterns, last processed tracking,
 * MPD polling interval, and previous signed segment paths.
 */
export class StreamStateRepository {
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

  getMpdPollingInterval(): number {
    return segmentStore.mpdPollingInterval;
  }

  setMpdPollingInterval(interval: number): void {
    segmentStore.mpdPollingInterval = interval;
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

  getGeneration(repId: string): number {
    return segmentStore.streamGenerations.get(repId) ?? 0;
  }

  incrementGeneration(repId: string): void {
    const current = segmentStore.streamGenerations.get(repId) ?? 0;
    segmentStore.streamGenerations.set(repId, current + 1);
  }
}
