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
  SegmentRecord,
  SegmentStatusValue,
  SequenceAnomalyReasonValue,
  Logger,
  MutableRef,
  C2paManifest,
} from '../types.js';
import { buildStreamKey } from '../utils/streamKey.js';

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
  manifest: MutableRef<C2paManifest | null>;
  supportedMediaTypes: MediaType[];
  logger: Logger;
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

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

const BOX_HEADER_SIZE = 8;

/** Returns true if the segment contains an mdat box with at least 1 byte of payload. */
function hasMdatContent(bytes: Uint8Array): boolean {
  let offset = 0;
  while (offset + BOX_HEADER_SIZE <= bytes.length) {
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
    if (size < BOX_HEADER_SIZE) break;
    if (type === 'mdat') return size > BOX_HEADER_SIZE;
    offset += size;
  }
  return false;
}

function buildUnverifiedRecord(
  segmentNumber: number,
  mediaType: MediaType,
  status: SegmentStatusValue,
  sequenceReason?: SequenceAnomalyReasonValue,
): SegmentRecord {
  return {
    segmentNumber,
    mediaType,
    keyId: null,
    hash: null,
    status,
    sequenceReason,
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
  private readonly adSequenceNumbers = new Map<MediaType, Set<number>>();
  private readonly recordedMissingSequences = new Map<MediaType, Set<number>>();

  constructor(deps: SegmentRouterDeps) {
    this.deps = deps;
  }

  async route(chunk: DashjsChunk): Promise<void> {
    if (chunk.segmentType === 'InitializationSegment') {
      await this.handleInitSegment(chunk);
      return;
    }

    const mediaType = chunk.mediaInfo.type;
    if (chunk.segmentType !== 'MediaSegment' || !isMediaType(mediaType)) {
      return;
    }

    await this.handleMediaSegment(chunk, mediaType);
  }

  reset(): void {
    this.adSequenceNumbers.clear();
    this.recordedMissingSequences.clear();
  }

  private async handleInitSegment(chunk: DashjsChunk): Promise<void> {
    if (!chunk.mediaInfo?.type || !isMediaType(chunk.mediaInfo.type)) return;

    const bytes = toUint8Array(chunk.bytes);
    const result = await this.deps.initProcessor.process(bytes);

    this.deps.eventBus.emit('initProcessed', result);

    if (result.success) {
      this.deps.manifest.value =
        result.sessionKeysCount > 0 ? (result.manifest ?? null) : null;
      for (const validator of Object.values(this.deps.manifestBoxValidators)) {
        validator?.reset();
      }
    }
  }

  private async handleMediaSegment(chunk: DashjsChunk, mediaType: MediaType): Promise<void> {
    const streamKey = buildStreamKey(mediaType, chunk.representationId);

    // Copy bytes before queueMicrotask — dash.js transfers the underlying
    // ArrayBuffer to MSE after this function returns, detaching it.
    const segmentBytes = new Uint8Array(toUint8Array(chunk.bytes));
    const segmentIndex = chunk.index + 1;

    if (!this.deps.sessionKeyStore.hasKeys()) {
      await this.handleManifestBoxSegment({ segmentBytes, mediaType, segmentIndex });
      return;
    }

    queueMicrotask(() => {
      void this.handleVsiSegment({ segmentBytes, streamKey, mediaType, segmentIndex });
    });
  }

  private async handleVsiSegment(params: VsiSegmentParams): Promise<void> {
    const { segmentBytes, streamKey, mediaType, segmentIndex } = params;

    let vsiResult: VsiValidationResult | null = null;
    try {
      vsiResult = await this.deps.vsiValidator.validate(segmentBytes, streamKey);
    } catch (error) {
      this.deps.eventBus.emit('error', { source: 'VsiValidator', error });
      return;
    }

    if (!vsiResult) {
      if (hasMdatContent(segmentBytes)) {
        this.trackAdSequence(mediaType, segmentIndex);
        this.emitSegmentValidated(
          (buildUnverifiedRecord(segmentIndex, mediaType, SegmentStatus.AD)),
        );
      } else {
        this.deps.logger.warn(
          `[SegmentRouter] No C2PA EMSG box in segment at index ${segmentIndex}`,
        );
      }
      return;
    }

    const status = resolveSegmentStatus(vsiResult.isValid, vsiResult.sequenceReason);

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

    const record = buildVsiSegmentRecord(vsiResult, mediaType, status, this.deps.manifest.value);
    this.emitSegmentValidated((record));
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
      const status = hasMdatContent(segmentBytes) ? SegmentStatus.AD : SegmentStatus.MISSING;
      if (status === SegmentStatus.AD) this.trackAdSequence(mediaType, segmentIndex);
      this.emitSegmentValidated(
        (buildUnverifiedRecord(segmentIndex, mediaType, status)),
      );
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
    this.emitSegmentValidated(
      ({
        segmentNumber: result.sequenceNumber,
        mediaType,
        keyId: null,
        hash: result.bmffHashHex,
        status,
        timestamp: Date.now(),
        errorCodes: asValidationErrorCodes(result.errorCodes),
        manifest: result.manifest,
        previousManifestId: result.previousManifestId,
      }),
    );
  }


  private emitSegmentValidated(record: SegmentRecord): void {
    this.deps.eventBus.emit('segmentValidated', record);
  }

  private trackAdSequence(mediaType: MediaType, sequenceNumber: number): void {
    const set = this.adSequenceNumbers.get(mediaType) ?? new Set<number>();
    set.add(sequenceNumber);
    this.adSequenceNumbers.set(mediaType, set);
  }

  private recordMissingSegments(mediaType: MediaType, from: number, to: number): void {
    const adNumbers = this.adSequenceNumbers.get(mediaType) ?? new Set<number>();
    const isAdGap = Array.from({ length: to - from + 1 }, (_, i) => from + i).some((n) =>
      adNumbers.has(n),
    );
    if (isAdGap) return;

    const recorded = this.recordedMissingSequences.get(mediaType) ?? new Set<number>();
    let missingCount = 0;
    for (let n = from; n <= to; n++) {
      if (recorded.has(n)) continue;
      recorded.add(n);
      missingCount++;
    }
    this.recordedMissingSequences.set(mediaType, recorded);

    if (missingCount > 0) {
      this.deps.eventBus.emit('segmentsMissing', { from, to, count: missingCount });
    }
  }
}
