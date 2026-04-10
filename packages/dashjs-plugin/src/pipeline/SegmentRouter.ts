import type { EventBus } from '../events/EventBus.js';
import type { InitSegmentProcessor } from './InitSegmentProcessor.js';
import type { VsiValidator, VsiValidationResult } from './VsiValidator.js';
import type { ManifestBoxValidator } from './ManifestBoxValidator.js';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { SegmentStore } from '../state/SegmentStore.js';
import type { TimeIntervalIndex } from '../state/TimeIntervalIndex.js';
import { ValidationErrorCode, SegmentStatus, SequenceAnomalyReason } from '../types.js';
import type {
  MediaType,
  SegmentRecord,
  SegmentStatusValue,
  SequenceAnomalyReasonValue,
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

const SEQUENCE_REASON_TO_STATUS: Partial<Record<SequenceAnomalyReasonValue, SegmentStatusValue>> = {
  [SequenceAnomalyReason.DUPLICATE]: SegmentStatus.REPLAYED,
  [SequenceAnomalyReason.OUT_OF_ORDER]: SegmentStatus.REORDERED,
  [SequenceAnomalyReason.GAP_DETECTED]: SegmentStatus.WARNING,
  [SequenceAnomalyReason.SEQUENCE_NUMBER_BELOW_MINIMUM]: SegmentStatus.INVALID,
};

const UNKNOWN_KEY_ID = 'unknown';
const UNAVAILABLE_HASH = 'N/A';
const NO_DATA = '—';

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

/** Returns true if the segment contains an mdat box with at least 1 byte of payload. */
function hasMdatContent(bytes: Uint8Array): boolean {
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    if (size < 8) break;
    if (type === 'mdat') return size > 8;
    offset += size;
  }
  return false;
}

function buildUnverifiedRecord(
  segmentNumber: number,
  mediaType: MediaType,
  status: SegmentStatusValue,
  sequenceReason?: SequenceAnomalyReasonValue,
): Omit<SegmentRecord, 'arrivalIndex'> {
  return {
    segmentNumber,
    mediaType,
    sequenceNumber: segmentNumber,
    keyId: NO_DATA,
    hash: NO_DATA,
    status,
    sequenceReason,
    timestamp: Date.now(),
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
      if (hasMdatContent(segmentBytes)) {
        this.deps.segmentStore.add(
          buildUnverifiedRecord(segmentIndex, mediaType, SegmentStatus.AD),
        );
        this.deps.eventBus.emit('segmentValidated', {
          segmentNumber: segmentIndex,
          status: SegmentStatus.AD,
          hash: NO_DATA,
          keyId: NO_DATA,
          mediaType,
        });
      } else {
        this.deps.logger.warn(
          `[SegmentRouter] No C2PA EMSG box in segment at index ${segmentIndex}`,
        );
      }
      return;
    }

    const status = resolveSegmentStatus(vsiResult.overall, vsiResult.sequenceReason);
    const forceNewArrival = status === SegmentStatus.REPLAYED || status === SegmentStatus.REORDERED;

    if (
      vsiResult.sequenceReason === SequenceAnomalyReason.GAP_DETECTED &&
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
      const status = hasMdatContent(segmentBytes) ? SegmentStatus.AD : SegmentStatus.MISSING;
      this.deps.segmentStore.add(buildUnverifiedRecord(segmentIndex, mediaType, status));
      this.deps.eventBus.emit('segmentValidated', {
        segmentNumber: segmentIndex,
        status,
        hash: NO_DATA,
        keyId: NO_DATA,
        mediaType,
      });
      return;
    }

    const isContinuityOnlyFailure =
      !result.isValid &&
      Array.isArray(result.errorCodes) &&
      result.errorCodes.every((c) => c === ValidationErrorCode.CONTINUITY_INVALID);
    const status: SegmentStatusValue = result.isValid
      ? SegmentStatus.VALID
      : isContinuityOnlyFailure
        ? SegmentStatus.WARNING
        : SegmentStatus.INVALID;
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
    status: SegmentStatusValue,
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
    const existing = this.deps.segmentStore
      .getAll()
      .filter(
        (s) => s.mediaType === mediaType && s.sequenceNumber >= from && s.sequenceNumber <= to,
      );
    const isAdGap = existing.some((s) => s.status === SegmentStatus.AD);

    let missingCount = 0;
    for (let n = from; n <= to; n++) {
      if (existing.some((s) => s.sequenceNumber === n)) continue;
      if (isAdGap) continue;
      this.deps.segmentStore.add(
        buildUnverifiedRecord(
          n,
          mediaType,
          SegmentStatus.MISSING,
          SequenceAnomalyReason.GAP_DETECTED,
        ),
      );
      missingCount++;
    }
    if (missingCount > 0) {
      this.deps.eventBus.emit('segmentsMissing', { from, to, count: missingCount });
    }
  }
}
