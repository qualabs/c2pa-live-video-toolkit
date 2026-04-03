import { EventBus } from './events/EventBus.js';
import { SessionKeyStore } from './state/SessionKeyStore.js';
import { SequenceTracker } from './state/SequenceTracker.js';
import { SegmentStore } from './state/SegmentStore.js';
import { TimeIntervalIndex } from './state/TimeIntervalIndex.js';
import { InitSegmentProcessor } from './pipeline/InitSegmentProcessor.js';
import { VsiValidator } from './pipeline/VsiValidator.js';
import { ManifestBoxValidator } from './pipeline/ManifestBoxValidator.js';
import { SegmentRouter } from './pipeline/SegmentRouter.js';
import { PlaybackTracker } from './playback/PlaybackTracker.js';
import { C2paController } from './C2paController.js';
import type { C2paOptions, Logger, MediaType } from './types.js';
import { DEFAULT_MEDIA_TYPES, DEFAULT_MAX_STORED_SEGMENTS } from './types.js';

const SILENT_LOGGER: Logger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function buildLogger(option: Logger | false | undefined): Logger {
  if (option === false) return SILENT_LOGGER;
  return option ?? console;
}

type DashjsPlayer = {
  extend: (name: string, factory: () => { modifyResponseAsync: (chunk: unknown) => Promise<unknown> }) => void;
  on: (event: string, handler: (e: unknown) => void) => void;
};

type DashjsPlaybackEvent = {
  time: number;
};

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
 * c2pa.on('segmentValidated', (e) => console.log(e.status));
 * player.initialize(videoElement, streamUrl, true);
 * ```
 */
export function attachC2pa(
  player: DashjsPlayer,
  options: C2paOptions = {},
): C2paController {
  const supportedMediaTypes: MediaType[] = options.mediaTypes ?? DEFAULT_MEDIA_TYPES;
  const maxStoredSegments = options.maxStoredSegments ?? DEFAULT_MAX_STORED_SEGMENTS;
  const logger = buildLogger(options.logger);

  // Shared mutable state containers (passed by reference)
  const activeManifest = { value: null as unknown };
  const currentQuality: Record<string, string | number | null> = {};
  for (const mediaType of supportedMediaTypes) {
    currentQuality[mediaType] = null;
  }

  // State stores (instance-scoped — safe for multiple players on the same page)
  const eventBus = new EventBus();
  const sessionKeyStore = new SessionKeyStore();
  const sequenceTracker = new SequenceTracker();
  const segmentStore = new SegmentStore(maxStoredSegments);
  const timeIndex = new TimeIntervalIndex();

  // Pipeline
  const initProcessor = new InitSegmentProcessor({ sessionKeyStore, logger });
  const vsiValidator = new VsiValidator({ sessionKeyStore, sequenceTracker });
  const manifestBoxValidator = new ManifestBoxValidator();

  const segmentRouter = new SegmentRouter({
    eventBus,
    initProcessor,
    vsiValidator,
    manifestBoxValidator,
    sessionKeyStore,
    segmentStore,
    timeIndex,
    activeManifest,
    currentQuality,
    supportedMediaTypes,
    logger,
  });

  const playbackTracker = new PlaybackTracker({
    eventBus,
    timeIndex,
    activeManifest,
    currentQuality,
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

  const PLAYBACK_TIME_UPDATED = 'playbackTimeUpdated';
  player.on(PLAYBACK_TIME_UPDATED, (e: unknown) => {
    if (isDetached) return;
    const time = (e as DashjsPlaybackEvent).time;
    playbackTracker.handleTimeUpdate(time);
  });

  // Wire up direct callback if provided
  if (options.onSegmentValidated) {
    const callback = options.onSegmentValidated;
    eventBus.on('segmentValidated', () => {
      const latest = segmentStore.getLast();
      if (latest) callback(latest);
    });
  }

  const controller = new C2paController({
    eventBus,
    segmentStore,
    sessionKeyStore,
    sequenceTracker,
    timeIndex,
    manifestBoxValidator,
    playbackTracker,
    currentQuality,
    activeManifest,
    detachFn: () => {
      isDetached = true;
    },
  });

  return controller;
}
