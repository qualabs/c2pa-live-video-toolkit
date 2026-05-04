import { describe, it, expect, vi } from 'vitest';
import { SegmentRouter } from '../pipeline/SegmentRouter.js';
import type { InitSegmentProcessor } from '../pipeline/InitSegmentProcessor.js';
import type { VsiValidator } from '../pipeline/VsiValidator.js';
import type { ManifestBoxValidator } from '../pipeline/ManifestBoxValidator.js';
import { EventBus } from '../events/EventBus.js';
import { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { ValidatedSessionKey } from '@svta/cml-c2pa';
import { SequenceAnomalyReason } from '../types.js';
import type { MediaSegmentInput, MediaType } from '../types.js';

function makeInput(overrides: Partial<MediaSegmentInput> = {}): MediaSegmentInput {
  return {
    kind: 'media',
    mediaType: 'video',
    bytes: new Uint8Array([0x00, 0x01]),
    segmentIndex: 1,
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
  });

  return { router, eventBus, sessionKeyStore, initProcessor, vsiValidator, manifestBoxValidator };
}

describe('SegmentRouter', () => {
  describe('init segment routing', () => {
    it('calls initProcessor for a video init segment', async () => {
      const { router, initProcessor } = buildDeps();
      await router.route(makeInput({ kind: 'init', mediaType: 'video' }));
      expect(initProcessor.process).toHaveBeenCalledOnce();
    });

    it('ignores init segment for unsupported media types', async () => {
      const { router, initProcessor } = buildDeps();
      await router.route(makeInput({ kind: 'init', mediaType: 'text' as unknown as MediaType }));
      expect(initProcessor.process).not.toHaveBeenCalled();
    });

    it('video init segment with same manifestId does not clear the video gap-detection state', async () => {
      // Scenario: video gets a 0-byte gap segment, then a quality switch triggers a new
      // video init with the SAME manifestId. The gap state must survive so that the next
      // valid video segment is correctly emitted as WARNING.
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const vsiValidator = { validate: vi.fn() };
      vsiValidator.validate
        .mockResolvedValueOnce(null) // video gap segment
        .mockResolvedValueOnce({ ...makeValidVsiResult(), sequenceNumber: 2 }); // video after gap

      const initProcess = vi.fn();
      initProcess
        .mockResolvedValueOnce({ success: true, sessionKeysCount: 1, manifestId: 'session-1' }) // initial video init
        .mockResolvedValueOnce({ success: true, sessionKeysCount: 1, manifestId: 'session-1' }); // quality switch — same manifestId

      const eventBus = new EventBus();
      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: initProcess } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidators: {},
        sessionKeyStore,
        manifest: { value: null },
        supportedMediaTypes: ['video', 'audio'],
      });

      const validated = vi.fn();
      eventBus.on('segmentValidated', validated);

      // 1. Initial video init (sets activeManifestId['video'] = 'session-1')
      await router.route(makeInput({ kind: 'init', mediaType: 'video' }));

      // 2. Video gap segment → previousWasUnverified['video'] = true
      await router.route(makeInput({ kind: 'media', mediaType: 'video', segmentIndex: 1 }));

      // 3. Video quality-switch init with SAME manifestId — must NOT clear gap state
      await router.route(makeInput({ kind: 'init', mediaType: 'video' }));

      // 4. Next valid video segment → gap state survives → WARNING
      await router.route(makeInput({ kind: 'media', mediaType: 'video', segmentIndex: 2 }));

      expect(validated).toHaveBeenCalledTimes(2);
      expect(validated.mock.calls[0][0]).toMatchObject({ segmentNumber: 1, status: 'unverified' });
      expect(validated.mock.calls[1][0]).toMatchObject({ segmentNumber: 2, status: 'warning' });
    });

    it('video init segment with different manifestId clears the video gap-detection state', async () => {
      // Scenario: video gets a 0-byte gap segment, then a new content period starts
      // (different manifestId). The gap state must be cleared so the new period starts fresh.
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const vsiValidator = { validate: vi.fn() };
      vsiValidator.validate
        .mockResolvedValueOnce(null) // video gap segment
        .mockResolvedValueOnce({ ...makeValidVsiResult(), sequenceNumber: 2 }); // new period segment

      const initProcess = vi.fn();
      initProcess
        .mockResolvedValueOnce({ success: true, sessionKeysCount: 1, manifestId: 'session-1' }) // initial video init
        .mockResolvedValueOnce({ success: true, sessionKeysCount: 1, manifestId: 'session-2' }); // period transition — different manifestId

      const eventBus = new EventBus();
      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: initProcess } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidators: {},
        sessionKeyStore,
        manifest: { value: null },
        supportedMediaTypes: ['video', 'audio'],
      });

      const validated = vi.fn();
      eventBus.on('segmentValidated', validated);

      // 1. Initial video init (sets activeManifestId['video'] = 'session-1')
      await router.route(makeInput({ kind: 'init', mediaType: 'video' }));

      // 2. Video gap segment → previousWasUnverified['video'] = true
      await router.route(makeInput({ kind: 'media', mediaType: 'video', segmentIndex: 1 }));

      // 3. New content period init with DIFFERENT manifestId — clears gap state
      await router.route(makeInput({ kind: 'init', mediaType: 'video' }));

      // 4. First segment of new period → gap state cleared → VALID (not WARNING)
      await router.route(makeInput({ kind: 'media', mediaType: 'video', segmentIndex: 2 }));

      expect(validated).toHaveBeenCalledTimes(1);
      expect(validated.mock.calls[0][0]).toMatchObject({ segmentNumber: 2, status: 'valid' });
    });

    it('audio init segment does not clear the video gap-detection state', async () => {
      // Scenario: video gets a 0-byte gap segment (no C2PA data), then an audio ABR switch
      // happens (audio init arrives). The video gap state must survive the audio init so that
      // the next valid video segment is correctly emitted as WARNING.
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const vsiValidator = {
        validate: vi.fn(),
      };
      // First video call: 0-byte → no C2PA data (vsiResult = null)
      // Audio init arrives in between
      // Second video call: valid → should emit WARNING because gap state was preserved
      vsiValidator.validate
        .mockResolvedValueOnce(null) // video gap segment
        .mockResolvedValueOnce({ ...makeValidVsiResult(), sequenceNumber: 2 }); // video after gap

      const eventBus = new EventBus();
      const router = new SegmentRouter({
        eventBus,
        initProcessor: {
          process: vi.fn().mockResolvedValue({ success: true, sessionKeysCount: 1, manifestId: 'm' }),
        } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidators: {},
        sessionKeyStore,
        manifest: { value: null },
        supportedMediaTypes: ['video', 'audio'],
      });

      const validated = vi.fn();
      eventBus.on('segmentValidated', validated);

      // 1. Video gap segment (0 bytes, no C2PA data) → sets previousWasUnverified['video']
      await router.route(makeInput({ kind: 'media', mediaType: 'video', segmentIndex: 1 }));

      // 2. Audio init segment arrives (ABR switch) — must NOT clear video gap state
      await router.route(makeInput({ kind: 'init', mediaType: 'audio' }));

      // 3. Next valid video segment → gap state survives → WARNING
      await router.route(makeInput({ kind: 'media', mediaType: 'video', segmentIndex: 2 }));

      // Expect: synthetic UNVERIFIED for segment 1 + WARNING for segment 2
      expect(validated).toHaveBeenCalledTimes(2);
      expect(validated.mock.calls[0][0]).toMatchObject({ segmentNumber: 1, status: 'unverified' });
      expect(validated.mock.calls[1][0]).toMatchObject({ segmentNumber: 2, status: 'warning' });
    });
  });

  describe('media segment routing', () => {
    it('routes to ManifestBoxValidator when no session keys are present', async () => {
      const { router, manifestBoxValidator, vsiValidator } = buildDeps();
      await router.route(makeInput());
      expect(manifestBoxValidator.validate).toHaveBeenCalledOnce();
      expect(vsiValidator.validate).not.toHaveBeenCalled();
    });

    it('routes to VsiValidator when session keys are present', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);
      const { router, vsiValidator, manifestBoxValidator } = buildDeps(sessionKeyStore);
      await router.route(makeInput());
      expect(vsiValidator.validate).toHaveBeenCalledOnce();
      expect(manifestBoxValidator.validate).not.toHaveBeenCalled();
    });

    it('ignores media segment with an unsupported media type', async () => {
      const { router, manifestBoxValidator } = buildDeps();
      await router.route(makeInput({ mediaType: 'text' as unknown as MediaType }));
      expect(manifestBoxValidator.validate).not.toHaveBeenCalled();
    });

    it('silently skips a media type outside the consumer-provided supportedMediaTypes', async () => {
      const eventBus = new EventBus();
      const manifestBoxValidator = {
        validate: vi.fn(),
        reset: vi.fn(),
      };
      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: vi.fn() } as unknown as InitSegmentProcessor,
        vsiValidator: { validate: vi.fn() } as unknown as VsiValidator,
        manifestBoxValidators: {
          video: manifestBoxValidator as unknown as ManifestBoxValidator,
        },
        sessionKeyStore: new SessionKeyStore(),
        manifest: { value: null },
        supportedMediaTypes: ['video'],
      });

      const errorListener = vi.fn();
      const validatedListener = vi.fn();
      eventBus.on('error', errorListener);
      eventBus.on('segmentValidated', validatedListener);

      await router.route(makeInput({ mediaType: 'audio' }));

      expect(manifestBoxValidator.validate).not.toHaveBeenCalled();
      expect(errorListener).not.toHaveBeenCalled();
      expect(validatedListener).not.toHaveBeenCalled();
    });
  });

  describe('ManifestBox path', () => {
    it('emits segmentValidated with status "valid" when validation passes', async () => {
      const { router, eventBus } = buildDeps();
      const listener = vi.fn();
      eventBus.on('segmentValidated', listener);
      await router.route(makeInput());
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
      await router.route(makeInput());
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
      await router.route(makeInput());
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({ status: 'valid', keyId: 'kid-1' });
    });

    it('retroactively upgrades isFirst (WARNING) and its audio companion (INVALID) to REORDERED when isSecond resolves', async () => {
      // Forward-reorder attack: slot N+1 gets seg N+2's content (isFirst, emsg seq=N+2),
      // slot N+2 gets seg N+1's content (isSecond, emsg seq=N+1).
      // CML sees N+2 after N → gap_detected → WARNING for isFirst video.
      // isFirst audio: hash broken by MFHD patch → INVALID, seqReason=valid.
      // isSecond video: seq=N+1 < N+2 → out_of_order → REORDERED.
      // Expected: isFirst video and audio both retroactively upgraded to REORDERED.
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const vsiValidator = { validate: vi.fn() };
      const N = 5;
      // isFirst video: gap_detected (seq N+2 = 7, expected N+1 = 6)
      vsiValidator.validate
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 2,
          isValid: true,
          sequenceReason: SequenceAnomalyReason.GAP_DETECTED,
        })
        // isFirst audio: hash broken, seqReason 'valid'
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 2,
          isValid: false,
          sequenceReason: 'valid' as unknown as null,
        })
        // isSecond video: out_of_order (seq N+1 = 6 < N+2 = 7)
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 1,
          isValid: true,
          sequenceReason: SequenceAnomalyReason.OUT_OF_ORDER,
        })
        // isSecond audio: hash broken, no seqReason
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 1,
          isValid: false,
          sequenceReason: null,
        });

      const eventBus = new EventBus();
      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: vi.fn() } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidators: {},
        sessionKeyStore,
        manifest: { value: null },
        supportedMediaTypes: ['video', 'audio'],
      });

      const validated = vi.fn();
      eventBus.on('segmentValidated', validated);

      await router.route(makeInput({ mediaType: 'video', streamId: '0', segmentIndex: N + 1 }));
      await router.route(makeInput({ mediaType: 'audio', streamId: '1', segmentIndex: N + 1 }));
      await router.route(makeInput({ mediaType: 'video', streamId: '0', segmentIndex: N + 2 }));
      await router.route(makeInput({ mediaType: 'audio', streamId: '1', segmentIndex: N + 2 }));

      // Events emitted (in order):
      //   1. isFirst video → WARNING (gap_detected)
      //   2. isFirst audio → INVALID (hash broken)
      //   3. isFirst video retroactive → REORDERED
      //   4. isFirst audio retroactive → REORDERED
      //   5. isSecond video → REORDERED
      //   6. isSecond audio → REORDERED (reclassified via prevRecord=REORDERED)
      expect(validated).toHaveBeenCalledTimes(6);

      const calls = validated.mock.calls.map((c) => c[0] as { segmentNumber: number; status: string; mediaType: string });
      // isFirst video: initial WARNING then retroactive REORDERED
      const isFirstVideoInitial = calls.find((c) => c.segmentNumber === N + 2 && c.mediaType === 'video' && c.status === 'warning');
      const isFirstVideoRetro = calls.filter((c) => c.segmentNumber === N + 2 && c.mediaType === 'video' && c.status === 'reordered');
      expect(isFirstVideoInitial).toBeDefined();
      expect(isFirstVideoRetro).toHaveLength(1);

      // isFirst audio: initial INVALID then retroactive REORDERED
      const isFirstAudioInitial = calls.find((c) => c.segmentNumber === N + 2 && c.mediaType === 'audio' && c.status === 'invalid');
      const isFirstAudioRetro = calls.filter((c) => c.segmentNumber === N + 2 && c.mediaType === 'audio' && c.status === 'reordered');
      expect(isFirstAudioInitial).toBeDefined();
      expect(isFirstAudioRetro).toHaveLength(1);

      // isSecond video and audio: REORDERED
      expect(calls.find((c) => c.segmentNumber === N + 1 && c.mediaType === 'video' && c.status === 'reordered')).toBeDefined();
      expect(calls.find((c) => c.segmentNumber === N + 1 && c.mediaType === 'audio' && c.status === 'reordered')).toBeDefined();
    });

    it('upgrades isFirst audio when audio isSecond overwrites lastVsiRecord before video isSecond cascades (ordering C)', async () => {
      // Real-world ordering: audio is smaller so it completes faster.
      // 1. Audio isFirst  (seq N+2) → INVALID  (hash broken by MFHD patch)
      // 2. Audio isSecond (seq N+1) → INVALID  (CML returns seqReason=valid, not out_of_order,
      //                                          because hash also fails — overwrites lastVsiRecord)
      // 3. Video isFirst  (seq N+2) → WARNING  (gap_detected due to CML tracker reset)
      // 4. Video isSecond (seq N+1) → REORDERED (out_of_order)
      //    → retroactive upgrade: video isFirst WARNING → REORDERED ✓
      //    → cascade at seq N+2: lastVsiRecord[audio] is now seq N+1, but prevLastVsiRecord[audio]
      //      still has seq N+2 INVALID → audio isFirst is found and upgraded ✓
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const vsiValidator = { validate: vi.fn() };
      const N = 5;
      vsiValidator.validate
        // 1. audio isFirst: hash broken, no seq anomaly from CML
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 2,
          isValid: false,
          sequenceReason: 'valid' as unknown as null,
        })
        // 2. audio isSecond: also hash broken, CML returns seqReason=valid (not out_of_order)
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 1,
          isValid: false,
          sequenceReason: null,
        })
        // 3. video isFirst: gap_detected (tracker reset)
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 2,
          isValid: false,
          sequenceReason: SequenceAnomalyReason.GAP_DETECTED,
        })
        // 4. video isSecond: out_of_order → REORDERED
        .mockResolvedValueOnce({
          ...makeValidVsiResult(),
          sequenceNumber: N + 1,
          isValid: true,
          sequenceReason: SequenceAnomalyReason.OUT_OF_ORDER,
        });

      const eventBus = new EventBus();
      const router = new SegmentRouter({
        eventBus,
        initProcessor: { process: vi.fn() } as unknown as InitSegmentProcessor,
        vsiValidator: vsiValidator as unknown as VsiValidator,
        manifestBoxValidators: {},
        sessionKeyStore,
        manifest: { value: null },
        supportedMediaTypes: ['video', 'audio'],
      });

      const validated = vi.fn();
      eventBus.on('segmentValidated', validated);

      await router.route(makeInput({ mediaType: 'audio', streamId: '1', segmentIndex: N + 1 })); // isFirst audio
      await router.route(makeInput({ mediaType: 'audio', streamId: '1', segmentIndex: N + 2 })); // isSecond audio
      await router.route(makeInput({ mediaType: 'video', streamId: '0', segmentIndex: N + 1 })); // isFirst video
      await router.route(makeInput({ mediaType: 'video', streamId: '0', segmentIndex: N + 2 })); // isSecond video

      const calls = validated.mock.calls.map((c) => c[0] as { segmentNumber: number; status: string; mediaType: string });

      // Both isFirst entries must end up REORDERED
      const isFirstAudioFinal = [...calls].reverse().find((c) => c.segmentNumber === N + 2 && c.mediaType === 'audio');
      const isFirstVideoFinal = [...calls].reverse().find((c) => c.segmentNumber === N + 2 && c.mediaType === 'video');
      expect(isFirstAudioFinal?.status).toBe('reordered');
      expect(isFirstVideoFinal?.status).toBe('reordered');

      // Both isSecond entries must be REORDERED
      const isSecondAudio = calls.find((c) => c.segmentNumber === N + 1 && c.mediaType === 'audio' && c.status === 'reordered');
      const isSecondVideo = calls.find((c) => c.segmentNumber === N + 1 && c.mediaType === 'video' && c.status === 'reordered');
      expect(isSecondAudio).toBeDefined();
      expect(isSecondVideo).toBeDefined();
    });

    it('emits a warning-status record when the validator reports gap_detected', async () => {
      const sessionKeyStore = new SessionKeyStore();
      sessionKeyStore.add({ kid: 'kid-1' } as unknown as ValidatedSessionKey);

      const gapVsiResult = {
        ...makeValidVsiResult(),
        sequenceNumber: 5,
        sequenceReason: SequenceAnomalyReason.GAP_DETECTED,
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
      });

      const validatedListener = vi.fn();
      eventBus.on('segmentValidated', validatedListener);

      await router.route(makeInput({ segmentIndex: 5 }));

      expect(validatedListener).toHaveBeenCalledOnce();
      expect(validatedListener.mock.calls[0][0]).toMatchObject({
        segmentNumber: 5,
        mediaType: 'video',
        status: 'warning',
        sequenceReason: SequenceAnomalyReason.GAP_DETECTED,
      });
    });
  });
});
