import { segmentStore, ManifestQueueItem } from './store.js';

/**
 * Repository for manifest queue, content, requirements, and enqueue tracking.
 */
export class ManifestRepository {
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

  clearAll(): void {
    segmentStore.manifestQueue.length = 0;
    segmentStore.manifestContent.clear();
    segmentStore.manifestRequirements.clear();
    segmentStore.manifestEnqueued.clear();
  }
}
