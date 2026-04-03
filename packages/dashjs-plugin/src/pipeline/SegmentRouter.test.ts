import { describe, it, expect, vi } from 'vitest';
import { SegmentRouter } from './SegmentRouter.js';
import type { InitSegmentProcessor } from './InitSegmentProcessor.js';
import type { VsiValidator } from './VsiValidator.js';
import type { ManifestBoxValidator } from './ManifestBoxValidator.js';
import { EventBus } from '../events/EventBus.js';
import { SessionKeyStore } from '../state/SessionKeyStore.js';
import { SegmentStore } from '../state/SegmentStore.js';
import { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import type { ValidatedSessionKey } from '@svta/cml-c2pa';
import type { Logger } from '../types.js';

const SILENT_LOGGER: Logger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const EMPTY_BUFFER = new Uint8Array([0x00, 0x01]).buffer;

type DashjsChunk = {
  segmentType: 'InitializationSegment' | 'MediaSegment';
  mediaInfo: { type: string };
  bytes: ArrayBuffer;
  start: number;
  end: number;
  index: number;
  representationId?: string | number;
};

function makeChunk(overrides: Partial<DashjsChunk> = {}): DashjsChunk {
  return {
    segmentType: 'MediaSegment',
    mediaInfo: { type: 'video' },
    bytes: EMPTY_BUFFER,
    start: 0,
    end: 2,
    index: 0,
    ...overrides,
  };
}

function makeValidVsiResult() {
  return {
    isValid: true,
    overall: true,
    sequenceNumber: 1,
    bmffHashHex: 'hash-abc',
    kidHex: 'kid-1',
    sequenceReason: null,
    sequenceMissingFrom: undefined,
    sequenceMissingTo: undefined,
    errorCodes: [],
  };
}

function makeValidManifestBoxResult() {
  return {
    isValid: true,
    sequenceNumber: 1,
    bmffHashHex: 'hash-abc',
    manifest: { issuer: 'test-issuer' },
    errorCodes: [],
  };
}

type BuiltDeps = {
  router: SegmentRouter;
  eventBus: EventBus;
  segmentStore: SegmentStore;
  sessionKeyStore: SessionKeyStore;
  initProcessor: { process: ReturnType<typeof vi.fn> };
  vsiValidator: { validate: ReturnType<typeof vi.fn> };
  manifestBoxValidator: { validate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
};

function buildDeps(sessionKeyStore = new SessionKeyStore()): BuiltDeps {
  const eventBus = new EventBus();
  const segmentStore = new SegmentStore(100);
  const timeIndex = new TimeIntervalIndex();

  const initProcessor = {
    process: vi.fn().mockResolvedValue({
      success: true,
      sessionKeysCount: 1,
      manifestId: 'manifest-1',
    }),
  };

  const vsiValidator = {
    validate: vi.fn().mockResolvedValue(makeValidVsiResult()),
  };

  const manifestBoxValidator = {
    validate: vi.fn().mockResolvedValue(makeValidManifestBoxResult()),
    reset: vi.fn(),
  };

  const router = new SegmentRouter({
    eventBus,
    initProcessor: initProcessor as unknown as InitSegmentProcessor,
    vsiValidator: vsiValidator as unknown as VsiValidator,
    manifestBoxValidator: manifestBoxValidator as unknown as ManifestBoxValidator,
    sessionKeyStore,
    segmentStore,
    timeIndex,
    activeManifest: { value: null },
    currentQuality: {},
    supportedMediaTypes: ['video', 'audio'],
    logger: SILENT_LOGGER,
  });

  return {
    router,
    eventBus,
    segmentStore,
    sessionKeyStore,
    initProcessor,
    vsiValidator,
    manifestBoxValidator,
  };
}

describe('SegmentRouter', () => {
  describe('InitializationSegment routing', () => {
    it('calls initProcessor for a video InitializationSegment', async () => {
      const { router, initProcessor } = buildDeps();
      await router.route(
        makeChunk({ segmentType: 'InitializationSegment', mediaInfo: { type: 'video' } }),
      );
      expect(initProcessor.process).toHaveBeenCalledOnce();
    });

    it('ignores InitializationSegment for non-video media types', async () => {
      const { router, initProcessor } = buildDeps();
      await router.route(
        makeChunk({ segmentType: 'InitializationSegment', mediaInfo: { type: 'audio' } }),
      );
      expect(initProcessor.process).not.toHaveBeenCalled();
    });
  });

  describe('MediaSegment routing', () => {
    it('routes to ManifestBoxValidator when no session keys are present', async () => {
      const { router, manifestBoxValidator, vsiValidator } = buildDeps();
      await router.route(makeChunk());
      expect(manifestBoxValidator.validate).toHaveBeenCalledOnce();
      expect(vsiValidator.validate).not.toHaveBeenCalled();
    });

    it('routes to VsiValidator when session keys are present', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);
      const { router, vsiValidator, manifestBoxValidator } = buildDeps(sessionKeyStore);
      await router.route(makeChunk());
      expect(vsiValidator.validate).toHaveBeenCalledOnce();
      expect(manifestBoxValidator.validate).not.toHaveBeenCalled();
    });

    it('ignores MediaSegment with an unsupported media type', async () => {
      const { router, manifestBoxValidator } = buildDeps();
      await router.route(makeChunk({ mediaInfo: { type: 'text' } }));
      expect(manifestBoxValidator.validate).not.toHaveBeenCalled();
    });
  });

  describe('ManifestBox path', () => {
    it('emits segmentValidated with status "valid" when validation passes', async () => {
      const { router, eventBus } = buildDeps();
      const listener = vi.fn();
      eventBus.on('segmentValidated', listener);
      await router.route(makeChunk());
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({ status: 'valid' });
    });

    it('emits segmentValidated with status "invalid" when validation fails', async () => {
      const { router, eventBus, manifestBoxValidator } = buildDeps();
      manifestBoxValidator.validate.mockResolvedValue({
        ...makeValidManifestBoxResult(),
        isValid: false,
      });
      const listener = vi.fn();
      eventBus.on('segmentValidated', listener);
      await router.route(makeChunk());
      expect(listener.mock.calls[0][0]).toMatchObject({ status: 'invalid' });
    });

    it('adds the validated segment to the store', async () => {
      const { router, segmentStore } = buildDeps();
      await router.route(makeChunk());
      expect(segmentStore.getAll()).toHaveLength(1);
      expect(segmentStore.getAll()[0].status).toBe('valid');
    });
  });

  describe('VSI path', () => {
    it('emits segmentValidated after validation', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);
      const { router, eventBus } = buildDeps(sessionKeyStore);
      const listener = vi.fn();
      eventBus.on('segmentValidated', listener);
      await router.route(makeChunk());
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({ status: 'valid', keyId: 'kid-1' });
    });

    it('adds the validated segment to the store', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);
      const { router, segmentStore } = buildDeps(sessionKeyStore);
      await router.route(makeChunk());
      expect(segmentStore.getAll()).toHaveLength(1);
      expect(segmentStore.getAll()[0].status).toBe('valid');
    });

    it('records missing segments and emits segmentsMissing on gap_detected', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const gapVsiResult = {
        ...makeValidVsiResult(),
        sequenceNumber: 5,
        sequenceReason: 'gap_detected' as const,
        sequenceMissingFrom: 2,
        sequenceMissingTo: 4,
      };

      const eventBus = new EventBus();
      const segmentStore = new SegmentStore(100);
      const vsiValidator = { validate: vi.fn().mockResolvedValue(gapVsiResult) };

      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: vi.fn() } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidator: {
          validate: vi.fn(),
          reset: vi.fn(),
        } as unknown as ManifestBoxValidator,
        sessionKeyStore,
        segmentStore,
        timeIndex: new TimeIntervalIndex(),
        activeManifest: { value: null },
        currentQuality: {},
        supportedMediaTypes: ['video', 'audio'],
        logger: SILENT_LOGGER,
      });

      const missingListener = vi.fn();
      eventBus.on('segmentsMissing', missingListener);

      await router.route(makeChunk({ index: 4 }));

      expect(missingListener).toHaveBeenCalledWith({ from: 2, to: 4, count: 3 });
      const missingSegments = segmentStore.getAll().filter((s) => s.status === 'missing');
      expect(missingSegments).toHaveLength(3);
      expect(missingSegments.map((s) => s.segmentNumber)).toEqual([2, 3, 4]);
    });
  });
});
