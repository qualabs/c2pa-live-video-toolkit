import { EventBus } from './events/EventBus.js';
import { SessionKeyStore } from './state/SessionKeyStore.js';
import { SequenceTracker } from './state/SequenceTracker.js';
import { InitSegmentProcessor } from './pipeline/InitSegmentProcessor.js';
import { VsiValidator } from './pipeline/VsiValidator.js';
import { ManifestBoxValidator } from './pipeline/ManifestBoxValidator.js';
import { SegmentRouter } from './pipeline/SegmentRouter.js';
import { C2paController } from './C2paController.js';
import { DEFAULT_MEDIA_TYPES } from './types.js';
import type {
  C2paOptions,
  Logger,
  MediaType,
  MediaSegmentInput,
  MutableRef,
  C2paManifest,
} from './types.js';

const SILENT_LOGGER: Logger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function buildLogger(option: Logger | false | undefined): Logger {
  if (option === false) return SILENT_LOGGER;
  return option ?? console;
}

/**
 * Options for {@link createC2paPipeline}. Extends {@link C2paOptions} with an
 * adapter-owned `onDetach` hook — invoked when the consumer calls
 * `controller.detach()`. Adapters use this to stop feeding segments into the
 * pipeline when the consumer tears down.
 */
export type CreateC2paPipelineOptions = C2paOptions & {
  onDetach?: () => void;
};

/**
 * A wired-up C2PA validation pipeline, decoupled from any streaming library.
 *
 * - `controller`: the public, event-emitting facade the end consumer holds.
 * - `route`: the function an adapter calls with each intercepted segment. Each
 *   call is fire-and-forget from the adapter's perspective, but the returned
 *   Promise can be awaited if back-pressure is desired.
 */
export type C2paPipeline = {
  controller: C2paController;
  route: (input: MediaSegmentInput) => Promise<void>;
};

/**
 * Creates a fully wired C2PA validation pipeline. This is the generic entry
 * point — player-specific adapters (dash.js, hls.js, shaka) call this and then
 * feed intercepted segments through `pipeline.route(input)`.
 *
 * @example
 * ```ts
 * const pipeline = createC2paPipeline({ mediaTypes: ['video'] });
 *
 * pipeline.controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
 *   console.log(record.status);
 * });
 *
 * // In your adapter's segment-interception callback:
 * await pipeline.route({
 *   kind: 'media',
 *   mediaType: 'video',
 *   bytes,
 *   segmentIndex: n,
 *   streamId: representationId,
 * });
 * ```
 */
export function createC2paPipeline(options: CreateC2paPipelineOptions = {}): C2paPipeline {
  const supportedMediaTypes: MediaType[] = options.mediaTypes ?? DEFAULT_MEDIA_TYPES;
  const logger = buildLogger(options.logger);

  const manifest: MutableRef<C2paManifest | null> = { value: null };

  const eventBus = new EventBus();
  const sessionKeyStore = new SessionKeyStore();
  const sequenceTracker = new SequenceTracker();

  const initProcessor = new InitSegmentProcessor({ sessionKeyStore, logger });
  const vsiValidator = new VsiValidator({ sessionKeyStore, sequenceTracker });
  const manifestBoxValidators: Partial<Record<string, ManifestBoxValidator>> = {};
  for (const mediaType of supportedMediaTypes) {
    manifestBoxValidators[mediaType] = new ManifestBoxValidator();
  }

  const segmentRouter = new SegmentRouter({
    eventBus,
    initProcessor,
    vsiValidator,
    manifestBoxValidators,
    sessionKeyStore,
    manifest,
  });

  const controller = new C2paController({
    eventBus,
    sessionKeyStore,
    sequenceTracker,
    manifestBoxValidators,
    manifest,
    detachFn: options.onDetach ?? (() => {}),
  });

  return {
    controller,
    route: (input) => segmentRouter.route(input),
  };
}
