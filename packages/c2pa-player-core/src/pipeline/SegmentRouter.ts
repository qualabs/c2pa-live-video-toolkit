import type { EventBus } from '../events/EventBus.js';
import type { InitSegmentProcessor } from './InitSegmentProcessor.js';
import type { VsiValidator, VsiValidationResult } from './VsiValidator.js';
import type { ManifestBoxValidator } from './ManifestBoxValidator.js';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import {
  ValidationErrorCode,
  SegmentStatus,
  SequenceAnomalyReason,
  isMediaType,
  asValidationErrorCodes,
} from '../types.js';
import type {
  MediaType,
  MediaSegmentInput,
  SegmentRecord,
  SegmentStatusValue,
  SequenceAnomalyReasonValue,
  MutableRef,
  C2paManifest,
} from '../types.js';
import { buildStreamKey } from '../utils/streamKey.js';

type SegmentRouterDeps = {
  eventBus: EventBus;
  initProcessor: InitSegmentProcessor;
  vsiValidator: VsiValidator;
  manifestBoxValidators: Partial<Record<string, ManifestBoxValidator>>;
  sessionKeyStore: SessionKeyStore;
  manifest: MutableRef<C2paManifest | null>;
  supportedMediaTypes: readonly MediaType[];
};

const SEQUENCE_REASON_TO_STATUS: Partial<Record<SequenceAnomalyReasonValue, SegmentStatusValue>> = {
  [SequenceAnomalyReason.DUPLICATE]: SegmentStatus.REPLAYED,
  [SequenceAnomalyReason.OUT_OF_ORDER]: SegmentStatus.REORDERED,
  [SequenceAnomalyReason.GAP_DETECTED]: SegmentStatus.WARNING,
  [SequenceAnomalyReason.SEQUENCE_NUMBER_BELOW_MINIMUM]: SegmentStatus.INVALID,
};

type VsiSegmentParams = {
  segmentBytes: Uint8Array;
  streamKey: string;
  mediaType: MediaType;
  segmentIndex: number;
};

type ManifestBoxSegmentParams = {
  segmentBytes: Uint8Array;
  mediaType: MediaType;
  segmentIndex: number;
};

function buildUnverifiedRecord(
  segmentNumber: number,
  mediaType: MediaType,
  status: SegmentStatusValue,
): SegmentRecord {
  return {
    segmentNumber,
    mediaType,
    keyId: null,
    hash: null,
    status,
    timestamp: Date.now(),
  };
}

function buildVsiSegmentRecord(
  vsiResult: VsiValidationResult,
  mediaType: MediaType,
  status: SegmentStatusValue,
  manifest: C2paManifest | null,
): SegmentRecord {
  return {
    segmentNumber: vsiResult.sequenceNumber,
    mediaType,
    keyId: vsiResult.kidHex,
    hash: vsiResult.bmffHashHex,
    status,
    sequenceReason: vsiResult.sequenceReason ?? undefined,
    timestamp: Date.now(),
    errorCodes: asValidationErrorCodes(vsiResult.errorCodes),
    manifest: manifest,
  };
}

function resolveSegmentStatus(
  isValid: boolean,
  sequenceReason: SequenceAnomalyReasonValue | null,
): SegmentStatusValue {
  if (sequenceReason) {
    const mapped = SEQUENCE_REASON_TO_STATUS[sequenceReason];
    if (mapped) return mapped;
  }
  return isValid ? SegmentStatus.VALID : SegmentStatus.INVALID;
}

export class SegmentRouter {
  private readonly deps: SegmentRouterDeps;
  private readonly previousWasUnverified = new Map<string, boolean>();

  constructor(deps: SegmentRouterDeps) {
    this.deps = deps;
  }

  /**
   * Route a player-agnostic segment input through the validation pipeline.
   * Unsupported mediaTypes are silently ignored.
   *
   * The adapter is responsible for copying bytes before calling this method if
   * its player detaches the underlying buffer asynchronously (e.g. dash.js
   * transfers ArrayBuffers to MSE after the response modifier resolves).
   */
  async route(input: MediaSegmentInput): Promise<void> {
    if (!isMediaType(input.mediaType)) return;
    if (!this.deps.supportedMediaTypes.includes(input.mediaType)) return;

    if (input.kind === 'init') {
      await this.handleInitSegment(input);
      return;
    }

    await this.handleMediaSegment(input);
  }

  private async handleInitSegment(input: MediaSegmentInput): Promise<void> {
    const result = await this.deps.initProcessor.process(input.bytes);

    this.deps.eventBus.emit('initProcessed', result);

    if (result.success) {
      this.deps.manifest.value = result.sessionKeysCount > 0 ? (result.manifest ?? null) : null;
      for (const validator of Object.values(this.deps.manifestBoxValidators)) {
        validator?.reset();
      }
      if (result.sessionKeysCount === 0) {
        for (const mediaType of this.deps.supportedMediaTypes) {
          this.previousWasUnverified.delete(mediaType);
        }
      }
    }
  }

  private async handleMediaSegment(input: MediaSegmentInput): Promise<void> {
    const { bytes, mediaType, segmentIndex, streamId } = input;
    const streamKey = buildStreamKey(mediaType, streamId);
    if (!this.deps.sessionKeyStore.hasKeys()) {
      await this.handleManifestBoxSegment({ segmentBytes: bytes, mediaType, segmentIndex });
      return;
    }

    queueMicrotask(() => {
      void this.handleVsiSegment({ segmentBytes: bytes, streamKey, mediaType, segmentIndex });
    });
  }

  private async handleVsiSegment(params: VsiSegmentParams): Promise<void> {
    const { segmentBytes, streamKey, mediaType } = params;

    let vsiResult: VsiValidationResult | null = null;
    try {
      vsiResult = await this.deps.vsiValidator.validate(segmentBytes, streamKey);
    } catch (error) {
      this.deps.eventBus.emit('error', { source: 'VsiValidator', error });
      return;
    }

    if (!vsiResult) {
      this.previousWasUnverified.set(mediaType, true);
      // Sequence number is unknown until the next valid segment arrives; emit then with inferred seq.
      return;
    }

    const hadGapBefore = this.previousWasUnverified.get(mediaType) ?? false;
    this.previousWasUnverified.set(mediaType, false);

    if (hadGapBefore) {
      this.emitSegmentValidated(
        buildUnverifiedRecord(vsiResult.sequenceNumber - 1, mediaType, SegmentStatus.UNVERIFIED),
      );
    }

    let status = resolveSegmentStatus(vsiResult.isValid, vsiResult.sequenceReason);
    if (hadGapBefore && status === SegmentStatus.VALID) {
      status = SegmentStatus.WARNING;
    }

    const record = buildVsiSegmentRecord(vsiResult, mediaType, status, this.deps.manifest.value);
    this.emitSegmentValidated(record);
  }

  private async handleManifestBoxSegment(params: ManifestBoxSegmentParams): Promise<void> {
    const { segmentBytes, mediaType, segmentIndex } = params;

    let result;
    try {
      const validator = this.deps.manifestBoxValidators[mediaType];
      if (!validator) {
        this.deps.eventBus.emit('error', {
          source: 'ManifestBoxValidator',
          error: `No validator for mediaType: ${mediaType}`,
        });
        return;
      }
      result = await validator.validate(segmentBytes, segmentIndex);
    } catch (error) {
      this.deps.eventBus.emit('error', { source: 'ManifestBoxValidator', error });
      return;
    }

    if (result.manifest == null) {
      this.previousWasUnverified.set(mediaType, true);
      this.emitSegmentValidated(
        buildUnverifiedRecord(segmentIndex, mediaType, SegmentStatus.UNVERIFIED),
      );
      return;
    }

    const hadGapBefore = this.previousWasUnverified.get(mediaType) ?? false;
    this.previousWasUnverified.set(mediaType, false);

    const isContinuityOnlyFailure =
      !result.isValid &&
      Array.isArray(result.errorCodes) &&
      result.errorCodes.every((c) => c === ValidationErrorCode.CONTINUITY_INVALID);

    // When the previous segment was a gap (unverified), a chain break on the
    // current segment is a continuity gap, not content tampering.
    const isChainBreakAfterGap =
      hadGapBefore &&
      !result.isValid &&
      Array.isArray(result.errorCodes) &&
      result.errorCodes.every((c) => c === ValidationErrorCode.SEGMENT_INVALID);

    const status: SegmentStatusValue = result.isValid
      ? SegmentStatus.VALID
      : isContinuityOnlyFailure || isChainBreakAfterGap
        ? SegmentStatus.WARNING
        : SegmentStatus.INVALID;

    this.emitSegmentValidated({
      segmentNumber: result.sequenceNumber,
      mediaType,
      keyId: null,
      hash: result.bmffHashHex,
      status,
      timestamp: Date.now(),
      errorCodes: asValidationErrorCodes(result.errorCodes),
      manifest: result.manifest,
      previousManifestId: result.previousManifestId,
    });
  }

  private emitSegmentValidated(record: SegmentRecord): void {
    this.deps.eventBus.emit('segmentValidated', record);
  }
}
