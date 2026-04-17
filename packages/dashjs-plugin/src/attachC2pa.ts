import { EventBus } from './events/EventBus.js';
import { SessionKeyStore } from './state/SessionKeyStore.js';
import { SequenceTracker } from './state/SequenceTracker.js';
import { InitSegmentProcessor } from './pipeline/InitSegmentProcessor.js';
import { VsiValidator } from './pipeline/VsiValidator.js';
import { ManifestBoxValidator } from './pipeline/ManifestBoxValidator.js';
import { SegmentRouter } from './pipeline/SegmentRouter.js';
import { C2paController } from './C2paController.js';
import type { C2paOptions, Logger, MediaType, MutableRef, C2paManifest } from './types.js';
import { DEFAULT_MEDIA_TYPES } from './types.js';

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
 * Minimal structural interface for the dash.js player methods this plugin uses.
 *
 * Uses `interface` + method syntax so TypeScript applies bivariant parameter
 * checking, making dashjs.MediaPlayerClass directly assignable without casts.
 */
export interface DashjsPlayer {
  extend(name: string, factoryOrChild: object, override?: boolean): void;
  on(event: string, handler: (e: unknown) => void, scope?: object): void;
}

/**
 * Attaches C2PA validation to a dash.js player instance.
 *
 * Must be called BEFORE `player.initialize()` because dash.js registers
 * extension factories during initialization.
 *
 * @example
 * ```ts
 * const player = dashjs.MediaPlayer().create();
 * const c2pa = attachC2pa(player);
 * c2pa.on(C2paEvent.SEGMENT_VALIDATED, (record) => console.log(record.status));
 * player.initialize(videoElement, streamUrl, true);
 * ```
 */
export function attachC2pa(player: DashjsPlayer, options: C2paOptions = {}): C2paController {
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
    supportedMediaTypes,
    logger,
  });

  // Wire up detach flag — dash.js has no API to unregister extensions,
  // so we use a flag to make modifyResponseAsync a no-op after detach.
  let isDetached = false;

  player.extend('SegmentResponseModifier', () => ({
    modifyResponseAsync: async (chunk: unknown) => {
      if (!isDetached) {
        await segmentRouter.route(chunk as Parameters<typeof segmentRouter.route>[0]);
      }
      return Promise.resolve(chunk);
    },
  }));

  return new C2paController({
    eventBus,
    segmentRouter,
    sessionKeyStore,
    sequenceTracker,
    manifestBoxValidators,
    manifest,
    detachFn: () => {
      isDetached = true;
    },
  });
}
