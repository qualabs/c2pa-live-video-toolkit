import type { SegmentRepository } from '../data/repository.js';

export class ManifestService {
  constructor(private readonly repository: SegmentRepository) {}

  storeManifestContent(publishTime: string, content: string): void {
    this.repository.setManifestContent(publishTime, content);
  }

  storeManifestRequirements(publishTime: string, requirements: Record<string, number>): void {
    this.repository.setManifestRequirements(publishTime, requirements);
  }

  enqueueManifest(publishTime: string, receivedTimestamp: number): boolean {
    if (this.repository.isManifestEnqueued(publishTime)) {
      return false;
    }
    this.repository.addToManifestQueue({ publishTime, receivedTimestamp });
    this.repository.addToManifestEnqueued(publishTime);
    return true;
  }

  isManifestReady(
    publishTime: string,
    getLastProcessed: (repId: string) => number,
  ): { ready: boolean; missingReps: string[] } {
    const requirements = this.repository.getManifestRequirements(publishTime);
    if (!requirements) {
      return { ready: false, missingReps: [] };
    }

    const missingReps: string[] = [];
    for (const [repId, requiredSegmentNumber] of Object.entries(requirements)) {
      if (getLastProcessed(repId) < requiredSegmentNumber) {
        missingReps.push(repId);
      }
    }

    return { ready: missingReps.length === 0, missingReps };
  }

  getManifestQueueSorted(): Array<{ publishTime: string; receivedTimestamp: number }> {
    const queue = this.repository.getManifestQueue();
    return [...queue].sort(
      (a, b) => new Date(a.publishTime).getTime() - new Date(b.publishTime).getTime(),
    );
  }

  getManifestRequirements(publishTime: string): Record<string, number> | undefined {
    return this.repository.getManifestRequirements(publishTime);
  }

  completeManifest(publishTime: string): string | undefined {
    const content = this.repository.getManifestContent(publishTime);
    if (!content) return undefined;

    this.repository.deleteManifestContent(publishTime);
    this.repository.deleteManifestRequirements(publishTime);
    this.repository.removeFromManifestQueue(publishTime);
    this.repository.removeFromManifestEnqueued(publishTime);

    return content;
  }

  removeManifest(publishTime: string): void {
    this.repository.deleteManifestContent(publishTime);
    this.repository.deleteManifestRequirements(publishTime);
    this.repository.removeFromManifestQueue(publishTime);
    this.repository.removeFromManifestEnqueued(publishTime);
  }
}
