import type { EventBus } from './events/EventBus.js';
import type { SegmentStore } from './state/SegmentStore.js';
import type { SessionKeyStore } from './state/SessionKeyStore.js';
import type { SequenceTracker } from './state/SequenceTracker.js';
import type { TimeIntervalIndex } from './state/TimeIntervalIndex.js';
import type { ManifestBoxValidator } from './pipeline/ManifestBoxValidator.js';
import type { PlaybackTracker } from './playback/PlaybackTracker.js';
import type { C2paEventMap, C2paEventType, SegmentRecord, PlaybackStatus } from './types.js';

type C2paControllerDeps = {
  eventBus: EventBus;
  segmentStore: SegmentStore;
  sessionKeyStore: SessionKeyStore;
  sequenceTracker: SequenceTracker;
  timeIndex: TimeIntervalIndex;
  manifestBoxValidator: ManifestBoxValidator;
  playbackTracker: PlaybackTracker;
  currentQuality: Record<string, string | number | null>;
  activeManifest: { value: unknown };
  detachFn: () => void;
};

export class C2paController {
  private readonly deps: C2paControllerDeps;

  constructor(deps: C2paControllerDeps) {
    this.deps = deps;
  }

  on<T extends C2paEventType>(event: T, listener: (payload: C2paEventMap[T]) => void): this {
    this.deps.eventBus.on(event, listener);
    return this;
  }

  once<T extends C2paEventType>(event: T, listener: (payload: C2paEventMap[T]) => void): this {
    this.deps.eventBus.once(event, listener);
    return this;
  }

  off<T extends C2paEventType>(event: T, listener: (payload: C2paEventMap[T]) => void): this {
    this.deps.eventBus.off(event, listener);
    return this;
  }

  getSegments(): SegmentRecord[] {
    return this.deps.segmentStore.getAll();
  }

  subscribeToSegments(listener: (segments: SegmentRecord[]) => void): () => void {
    return this.deps.segmentStore.subscribe(listener);
  }

  getStatusAtTime(time: number): PlaybackStatus {
    return this.deps.playbackTracker.queryStatusAtTime(time);
  }

  reset(): void {
    this.deps.segmentStore.clear();
    this.deps.sessionKeyStore.clear();
    this.deps.sequenceTracker.clearAll();
    this.deps.timeIndex.clear();
    this.deps.manifestBoxValidator.reset();
    this.deps.activeManifest.value = null;

    for (const key of Object.keys(this.deps.currentQuality)) {
      this.deps.currentQuality[key] = null;
    }

    this.deps.eventBus.emit('reset', {});
  }

  detach(): void {
    this.reset();
    this.deps.eventBus.removeAllListeners();
    this.deps.detachFn();
  }
}
