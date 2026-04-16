import type { EventBus } from './events/EventBus.js';
import type { SegmentRouter } from './pipeline/SegmentRouter.js';
import type { SessionKeyStore } from './state/SessionKeyStore.js';
import type { SequenceTracker } from './state/SequenceTracker.js';
import type { ManifestBoxValidator } from './pipeline/ManifestBoxValidator.js';
import type { C2paEventMap, C2paEventType, MutableRef, C2paManifest } from './types.js';

type C2paControllerDeps = {
  eventBus: EventBus;
  segmentRouter: SegmentRouter;
  sessionKeyStore: SessionKeyStore;
  sequenceTracker: SequenceTracker;
  manifestBoxValidators: Partial<Record<string, ManifestBoxValidator>>;
  manifest: MutableRef<C2paManifest | null>;
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

  reset(): void {
    this.deps.segmentRouter.reset();
    this.deps.sessionKeyStore.clear();
    this.deps.sequenceTracker.clearAll();
    for (const validator of Object.values(this.deps.manifestBoxValidators)) {
      validator?.reset();
    }
    this.deps.manifest.value = null;
    this.deps.eventBus.emit('reset', {});
  }

  detach(): void {
    this.reset();
    this.deps.eventBus.removeAllListeners();
    this.deps.detachFn();
  }
}
