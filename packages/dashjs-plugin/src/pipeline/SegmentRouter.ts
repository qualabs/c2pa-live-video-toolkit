import type { EventBus } from '../events/EventBus.js';
import type { InitSegmentProcessor } from './InitSegmentProcessor.js';
import type { VsiValidator, VsiValidationResult } from './VsiValidator.js';
import type { ManifestBoxValidator } from './ManifestBoxValidator.js';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { SegmentStore } from '../state/SegmentStore.js';
import type { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import type {
  MediaType,
  SegmentRecord,
  SegmentStatus,
  SequenceAnomalyReason,
  ValidationErrorCode,
  Logger,
} from '../types.js';
import { buildStreamKey } from '../utils/streamKey.js';

type TimeIndexEntry = Parameters<TimeIntervalIndex['insert']>[2];

type DashjsChunk = {
  segmentType: 'InitializationSegment' | 'MediaSegment';
  mediaInfo: { type: string };
  bytes: ArrayBuffer | Uint8Array;
  start: number;
  end: number;
  index: number;
  representationId?: string | number;
};

type SegmentRouterDeps = {
  eventBus: EventBus;
  initProcessor: InitSegmentProcessor;
  vsiValidator: VsiValidator;
  manifestBoxValidators: Partial<Record<string, ManifestBoxValidator>>;
  sessionKeyStore: SessionKeyStore;
  segmentStore: SegmentStore;
  timeIndex: TimeIntervalIndex;
  activeManifest: { value: unknown };
  currentQuality: Record<string, string | number | null>;
  supportedMediaTypes: MediaType[];
  logger: Logger;
};

const SEQUENCE_REASON_TO_STATUS: Record<string, SegmentStatus> = {
  duplicate: 'replayed',
  out_of_order: 'reordered',
  gap_detected: 'warning',
  sequence_number_below_minimum: 'invalid',
};

const UNKNOWN_KEY_ID = 'unknown';
const UNAVAILABLE_HASH = 'N/A';
const MISSING_SEGMENT_PLACEHOLDER = '—';

type VsiSegmentParams = {
  segmentBytes: Uint8Array;
  streamKey: string;
  mediaType: MediaType;
  chunkStart: number;
  chunkEnd: number;
  segmentIndex: number;
  representationId?: string | number;
  segmentType: string;
};

type ManifestBoxSegmentParams = {
  segmentBytes: Uint8Array;
  streamKey: string;
  mediaType: MediaType;
  chunkStart: number;
  chunkEnd: number;
  segmentIndex: number;
  segmentType: string;
};

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function resolveSegmentStatus(
  isValid: boolean,
  sequenceReason: SequenceAnomalyReason | null,
): SegmentStatus {
  if (sequenceReason && SEQUENCE_REASON_TO_STATUS[sequenceReason]) {
    return SEQUENCE_REASON_TO_STATUS[sequenceReason];
  }
  return isValid ? 'valid' : 'invalid';
}

export class SegmentRouter {
  private readonly deps: SegmentRouterDeps;

  constructor(deps: SegmentRouterDeps) {
    this.deps = deps;
  }

  async route(chunk: DashjsChunk): Promise<void> {
    if (chunk.segmentType === 'InitializationSegment') {
      await this.handleInitSegment(chunk);
      return;
    }

    if (
      chunk.segmentType !== 'MediaSegment' ||
      !this.deps.supportedMediaTypes.includes(chunk.mediaInfo.type as MediaType)
    ) {
      return;
    }

    await this.handleMediaSegment(chunk);
  }

  private async handleInitSegment(chunk: DashjsChunk): Promise<void> {
    if (!this.deps.supportedMediaTypes.includes(chunk.mediaInfo?.type as MediaType)) return;

    const bytes = toUint8Array(chunk.bytes);
    const result = await this.deps.initProcessor.process(bytes);

    this.deps.eventBus.emit('initProcessed', result);

    if (result.success) {
      this.deps.activeManifest.value = null;
      for (const validator of Object.values(this.deps.manifestBoxValidators)) {
        validator?.reset();
      }
    }
  }

  private async handleMediaSegment(chunk: DashjsChunk): Promise<void> {
    const mediaType = chunk.mediaInfo.type as MediaType;
    const streamKey = buildStreamKey(mediaType, chunk.representationId);

    // Copy bytes before queueMicrotask — dash.js transfers the underlying
    // ArrayBuffer to MSE after this function returns, detaching it.
    const segmentBytes = new Uint8Array(toUint8Array(chunk.bytes));
    const chunkStart = chunk.start;
    const chunkEnd = chunk.end;
    const segmentIndex = chunk.index + 1;

    if (!this.deps.sessionKeyStore.hasKeys()) {
      await this.handleManifestBoxSegment({
        segmentBytes,
        streamKey,
        mediaType,
        chunkStart,
        chunkEnd,
        segmentIndex,
        segmentType: chunk.segmentType,
      });
      return;
    }

    queueMicrotask(() => {
      void this.handleVsiSegment({
        segmentBytes,
        streamKey,
        mediaType,
        chunkStart,
        chunkEnd,
        segmentIndex,
        representationId: chunk.representationId,
        segmentType: chunk.segmentType,
      });
    });
  }

  private async handleVsiSegment(params: VsiSegmentParams): Promise<void> {
    const {
      segmentBytes,
      streamKey,
      mediaType,
      chunkStart,
      chunkEnd,
      segmentIndex,
      representationId,
      segmentType,
    } = params;

    let vsiResult: VsiValidationResult | null = null;
    try {
      vsiResult = await this.deps.vsiValidator.validate(segmentBytes, streamKey);
    } catch (error) {
      this.deps.eventBus.emit('error', { source: 'VsiValidator', error });
      return;
    }

    if (!vsiResult) {
      this.deps.logger.warn(`[SegmentRouter] No C2PA EMSG box in segment at index ${segmentIndex}`);
      return;
    }

    const status = resolveSegmentStatus(vsiResult.overall, vsiResult.sequenceReason);
    const forceNewArrival = status === 'replayed' || status === 'reordered';

    if (
      vsiResult.sequenceReason === 'gap_detected' &&
      vsiResult.sequenceMissingFrom != null &&
      vsiResult.sequenceMissingTo != null
    ) {
      this.recordMissingSegments(
        mediaType,
        vsiResult.sequenceMissingFrom,
        vsiResult.sequenceMissingTo,
      );
    }

    const record = this.buildVsiSegmentRecord(vsiResult, mediaType, status);
    const interval: [number, number] = [chunkStart, chunkEnd];

    this.storeAndIndexSegment(
      record,
      streamKey,
      interval,
      { type: segmentType, manifest: null, interval, valid: vsiResult.overall },
      forceNewArrival,
    );

    if (this.deps.currentQuality[mediaType] === null) {
      this.deps.currentQuality[mediaType] = representationId ?? null;
    }

    this.deps.eventBus.emit('segmentValidated', {
      segmentNumber: vsiResult.sequenceNumber,
      status,
      sequenceReason: vsiResult.sequenceReason ?? undefined,
      hash: record.hash,
      keyId: record.keyId,
      mediaType,
      errorCodes: vsiResult.errorCodes as ValidationErrorCode[] | undefined,
    });
  }

  private async handleManifestBoxSegment(params: ManifestBoxSegmentParams): Promise<void> {
    const { segmentBytes, streamKey, mediaType, chunkStart, chunkEnd, segmentIndex, segmentType } =
      params;

    let result;
    try {
      const validator = this.deps.manifestBoxValidators[mediaType];
      if (!validator) {
        this.deps.eventBus.emit('error', { source: 'ManifestBoxValidator', error: `No validator for mediaType: ${mediaType}` });
        return;
      }
      result = await validator.validate(segmentBytes, segmentIndex);
    } catch (error) {
      this.deps.eventBus.emit('error', { source: 'ManifestBoxValidator', error });
      return;
    }

    if (result.manifest == null) {
      this.deps.segmentStore.add({
        segmentNumber: segmentIndex,
        mediaType,
        sequenceNumber: segmentIndex,
        keyId: MISSING_SEGMENT_PLACEHOLDER,
        hash: MISSING_SEGMENT_PLACEHOLDER,
        status: 'ad',
        timestamp: Date.now(),
      });
      return;
    }

    const continuityOk =
      result.expectedPreviousManifestId == null ||
      result.previousManifestId === result.expectedPreviousManifestId;
    const isContinuityOnlyFailure =
      !result.isValid &&
      Array.isArray(result.errorCodes) &&
      result.errorCodes.every((c) => c === 'livevideo.continuityMethod.invalid');
    const status: SegmentStatus = result.isValid ? 'valid' : isContinuityOnlyFailure ? 'warning' : 'invalid';
    const hash = result.bmffHashHex ?? UNAVAILABLE_HASH;
    const interval: [number, number] = [chunkStart, chunkEnd];

    this.storeAndIndexSegment(
      {
        segmentNumber: result.sequenceNumber,
        mediaType,
        sequenceNumber: result.sequenceNumber,
        keyId: UNAVAILABLE_HASH,
        hash,
        status,
        timestamp: Date.now(),
        validationResults: {
          overall: result.isValid,
          // CML returns string[] — cast to the known union of valid codes
          errorCodes: result.errorCodes as ValidationErrorCode[] | undefined,
        },
        manifest: result.manifest,
        previousManifestId: result.previousManifestId,
        continuityOk,
      },
      streamKey,
      interval,
      { type: segmentType, manifest: result.manifest, interval, valid: result.isValid },
    );

    this.deps.eventBus.emit('segmentValidated', {
      segmentNumber: result.sequenceNumber,
      status,
      hash,
      keyId: UNAVAILABLE_HASH,
      mediaType,
      errorCodes: result.errorCodes as ValidationErrorCode[] | undefined,
    });
  }

  private buildVsiSegmentRecord(
    vsiResult: VsiValidationResult,
    mediaType: MediaType,
    status: SegmentStatus,
  ): Omit<SegmentRecord, 'arrivalIndex'> {
    return {
      segmentNumber: vsiResult.sequenceNumber,
      mediaType,
      sequenceNumber: vsiResult.sequenceNumber,
      keyId: vsiResult.kidHex ?? UNKNOWN_KEY_ID,
      hash: vsiResult.bmffHashHex ?? UNAVAILABLE_HASH,
      status,
      sequenceReason: vsiResult.sequenceReason ?? undefined,
      timestamp: Date.now(),
      validationResults: {
        overall: vsiResult.overall,
        // CML returns string[] — cast to the known union of valid codes
        errorCodes: vsiResult.errorCodes as ValidationErrorCode[] | undefined,
      },
      manifest: this.deps.activeManifest.value,
    };
  }

  private storeAndIndexSegment(
    record: Omit<SegmentRecord, 'arrivalIndex'>,
    streamKey: string,
    interval: [number, number],
    indexEntry: TimeIndexEntry,
    forceNewArrival = false,
  ): void {
    this.deps.segmentStore.add(record, forceNewArrival);
    this.deps.timeIndex.insert(streamKey, interval, indexEntry);
  }

  private recordMissingSegments(mediaType: MediaType, from: number, to: number): void {
    const count = to - from + 1;
    for (let n = from; n <= to; n++) {
      this.deps.segmentStore.add({
        segmentNumber: n,
        mediaType,
        sequenceNumber: n,
        keyId: MISSING_SEGMENT_PLACEHOLDER,
        hash: MISSING_SEGMENT_PLACEHOLDER,
        status: 'missing',
        sequenceReason: 'gap_detected',
        timestamp: Date.now(),
      });
    }
    this.deps.eventBus.emit('segmentsMissing', { from, to, count });
  }
}
