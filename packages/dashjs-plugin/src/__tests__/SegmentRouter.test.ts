import { describe, it, expect, vi } from 'vitest';
import { SegmentRouter } from '../pipeline/SegmentRouter.js';
import type { InitSegmentProcessor } from '../pipeline/InitSegmentProcessor.js';
import type { VsiValidator } from '../pipeline/VsiValidator.js';
import type { ManifestBoxValidator } from '../pipeline/ManifestBoxValidator.js';
import { EventBus } from '../events/EventBus.js';
import { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { ValidatedSessionKey } from '@svta/cml-c2pa';
import { SequenceAnomalyReason } from '../types.js';
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
  sessionKeyStore: SessionKeyStore;
  initProcessor: { process: ReturnType<typeof vi.fn> };
  vsiValidator: { validate: ReturnType<typeof vi.fn> };
  manifestBoxValidator: { validate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
};

function buildDeps(sessionKeyStore = new SessionKeyStore()): BuiltDeps {
  const eventBus = new EventBus();

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
    manifestBoxValidators: {
      video: manifestBoxValidator as unknown as ManifestBoxValidator,
      audio: manifestBoxValidator as unknown as ManifestBoxValidator,
    },
    sessionKeyStore,
    manifest: { value: null },
    supportedMediaTypes: ['video', 'audio'],
    logger: SILENT_LOGGER,
  });

  return { router, eventBus, sessionKeyStore, initProcessor, vsiValidator, manifestBoxValidator };
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

    it('ignores InitializationSegment for unsupported media types', async () => {
      const { router, initProcessor } = buildDeps();
      await router.route(
        makeChunk({ segmentType: 'InitializationSegment', mediaInfo: { type: 'text' } }),
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
        errorCodes: ['livevideo.segment.invalid'],
      });
      const listener = vi.fn();
      eventBus.on('segmentValidated', listener);
      await router.route(makeChunk());
      expect(listener.mock.calls[0][0]).toMatchObject({ status: 'invalid' });
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

    it('exposes the missing sequence range on the validated record when gap_detected', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const gapVsiResult = {
        ...makeValidVsiResult(),
        sequenceNumber: 5,
        sequenceReason: SequenceAnomalyReason.GAP_DETECTED,
        sequenceMissingFrom: 2,
        sequenceMissingTo: 4,
      };

      const eventBus = new EventBus();
      const vsiValidator = { validate: vi.fn().mockResolvedValue(gapVsiResult) };

      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: vi.fn() } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidators: {
          video: { validate: vi.fn(), reset: vi.fn() } as unknown as ManifestBoxValidator,
        },
        sessionKeyStore,
        manifest: { value: null },
        supportedMediaTypes: ['video', 'audio'],
        logger: SILENT_LOGGER,
      });

      const validatedListener = vi.fn();
      eventBus.on('segmentValidated', validatedListener);

      await router.route(makeChunk({ index: 4 }));

      expect(validatedListener).toHaveBeenCalledOnce();
      expect(validatedListener.mock.calls[0][0]).toMatchObject({
        segmentNumber: 5,
        mediaType: 'video',
        sequenceReason: SequenceAnomalyReason.GAP_DETECTED,
        sequenceMissingFrom: 2,
        sequenceMissingTo: 4,
      });
    });
  });
});
