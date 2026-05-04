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
  [SequenceAnomalyReason.SEQUENCE_NUMBER_BELOW_MINIMUM]: SegmentStatus.REPLAYED,
};

type VsiSegmentParams = {
  segmentBytes: Uint8Array;
  streamKey: string;
  mediaType: MediaType;
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
  // Keyed by streamKey (not mediaType) because the replay attack targets a single representation;
  // other representations are VALID and must not clobber the flag for the replayed one.
  private readonly previousWasReplayed = new Map<string, boolean>();
  // Accumulates all manifestIds ever seen per media type within the current content period.
  // A quality switch brings a different manifestId (each representation is signed separately),
  // but when GapController switches back to a quality we've already played, that manifestId is
  // in the set and we know it's a same-period switch — so we preserve gap-detection state.
  // The set is cleared only when an unsigned init arrives (genuine period transition, e.g. ad).
  private readonly knownManifestIds = new Map<string, Set<string>>();
  // Tracks the last VSI record emitted per streamKey to allow retroactive WARNING of the arming
  // slot when a replay is detected (the arming slot resolves before the replayed segment due to
  // microtask ordering, so it gets emitted as VALID and needs to be updated after the fact).
  private readonly lastVsiRecord = new Map<string, SegmentRecord>();
  // Holds the second-to-last record per streamKey. Required for the reorder retroactive cascade:
  // audio isSecond can process before video isSecond, overwriting lastVsiRecord[audioKey] from
  // isFirstSeq to isSecondSeq. Without prevLastVsiRecord the cascade would miss audio isFirst.
  private readonly prevLastVsiRecord = new Map<string, SegmentRecord>();

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

    // Only reset state for the media type of this init segment.
    // Resetting all media types would wipe the gap-detection state for the other track,
    // causing it to miss the WARNING when the next valid segment arrives after a gap.
    this.deps.manifestBoxValidators[input.mediaType]?.reset();

    if (result.success) {
      const newManifestId = result.manifestId;
      const known = this.knownManifestIds.get(input.mediaType) ?? new Set<string>();
      // A manifestId we've already seen means we've played this quality level before within
      // the current content period (GapController switched back to it). Preserve gap-detection
      // state so the WARNING fires on the next valid segment.
      // A never-seen manifestId is either a genuine period transition or the first time we hit
      // this quality — in both cases, conservatively clear gap state.
      const isKnownSession = newManifestId !== undefined && known.has(newManifestId);

      if (!isKnownSession) {
        this.previousWasUnverified.delete(input.mediaType);
        // previousWasReplayed is keyed by streamKey, so a new quality level starts fresh
        // automatically — nothing to delete here.
      }
      if (newManifestId !== undefined) {
        known.add(newManifestId);
        this.knownManifestIds.set(input.mediaType, known);
      }

      this.deps.manifest.value = result.sessionKeysCount > 0 ? (result.manifest ?? null) : null;
    } else {
      // Unsigned / unrecognised init (e.g. ad period) — clear cross-period state so that
      // the incoming media segments are routed through ManifestBox with a clean slate and
      // emitted as UNVERIFIED rather than being silently dropped.
      // Also reset knownManifestIds so the next content period starts fresh.
      this.previousWasUnverified.delete(input.mediaType);
      for (const key of this.previousWasReplayed.keys()) {
        if (key.startsWith(`${input.mediaType}-`)) this.previousWasReplayed.delete(key);
      }
      for (const key of [...this.lastVsiRecord.keys()]) {
        if (key.startsWith(`${input.mediaType}-`)) {
          this.prevLastVsiRecord.delete(key);
          this.lastVsiRecord.delete(key);
        }
      }
      this.knownManifestIds.delete(input.mediaType);
      this.deps.manifest.value = null;
      this.deps.sessionKeyStore.clear();
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
      void this.handleVsiSegment({ segmentBytes: bytes, streamKey, mediaType });
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
      return;
    }

    const hadGapBefore = this.previousWasUnverified.get(mediaType) ?? false;
    const hadReplayBefore = this.previousWasReplayed.get(streamKey) ?? false;
    this.previousWasUnverified.set(mediaType, false);

    if (hadGapBefore) {
      this.emitSegmentValidated(
        buildUnverifiedRecord(vsiResult.sequenceNumber - 1, mediaType, SegmentStatus.UNVERIFIED),
      );
    }

    let status = resolveSegmentStatus(vsiResult.isValid, vsiResult.sequenceReason);

    // CML returns the string 'valid' (not null) when there is no sequence anomaly. Treat it the
    // same as null so the reclassification checks below can use hasNoAnomalyReason consistently.
    const hasNoAnomalyReason =
      !vsiResult.sequenceReason || vsiResult.sequenceReason === ('valid' as SequenceAnomalyReasonValue);

    const prevRecord = this.lastVsiRecord.get(streamKey);

    // Both halves of a forward-reorder swap should surface as REORDERED:
    //   - Complement direction (video): CML didn't advance its counter after OUT_OF_ORDER, so
    //     slot N+2 (serving seq N+1) looks VALID to CML. Seq equals prevRecord (both N+1), so <=.
    //   - Complement direction (video, alt): SEQUENCE_NUMBER_BELOW_MINIMUM after REORDERED → REORDERED
    //   - Complement direction (audio): INVALID without seqReason after REORDERED → REORDERED
    //     (MFHD patch breaks the hash for audio, masking the sequence anomaly)
    //   - First-swap audio: INVALID without seqReason, companion video already REORDERED
    //     at the same seq → infer REORDERED for this track too.
    if (prevRecord?.status === SegmentStatus.REORDERED) {
      if (
        (status === SegmentStatus.REPLAYED &&
          vsiResult.sequenceReason === SequenceAnomalyReason.SEQUENCE_NUMBER_BELOW_MINIMUM) ||
        (status === SegmentStatus.INVALID && hasNoAnomalyReason) ||
        (status === SegmentStatus.VALID && vsiResult.sequenceNumber <= prevRecord.segmentNumber)
      ) {
        status = SegmentStatus.REORDERED;
      }
    }
    if (status === SegmentStatus.INVALID && hasNoAnomalyReason) {
      for (const [key, rec] of this.lastVsiRecord.entries()) {
        if (
          !key.startsWith(`${mediaType}-`) &&
          rec.segmentNumber === vsiResult.sequenceNumber &&
          rec.status === SegmentStatus.REORDERED
        ) {
          status = SegmentStatus.REORDERED;
          break;
        }
      }
    }

    if (hadGapBefore && status === SegmentStatus.VALID) {
      status = SegmentStatus.WARNING;
    }
    if (hadReplayBefore && status === SegmentStatus.VALID) {
      status = SegmentStatus.WARNING;
    }

    // When a replay is detected, the arming slot (seq N+1) was already emitted as VALID before
    // the replayed segment resolved — microtask ordering means the arming slot runs first.
    // Retroactively re-emit it as WARNING so the table shows a clean REPLAYED → WARNING chain.
    if (status === SegmentStatus.REPLAYED) {
      const armingSlot = this.lastVsiRecord.get(streamKey);
      if (
        armingSlot?.segmentNumber === vsiResult.sequenceNumber + 1 &&
        armingSlot.status === SegmentStatus.VALID
      ) {
        this.emitSegmentValidated({ ...armingSlot, status: SegmentStatus.WARNING, timestamp: Date.now() });
      }

      // Audio CML doesn't detect DUPLICATE when MFHD+TFDT are patched (hash fails, seqReason=null).
      // Infer REPLAYED for companion tracks that already emitted at the same sequence number.
      for (const [key, rec] of this.lastVsiRecord.entries()) {
        if (
          !key.startsWith(`${mediaType}-`) &&
          rec.segmentNumber === vsiResult.sequenceNumber &&
          rec.status !== SegmentStatus.REPLAYED
        ) {
          this.emitSegmentValidated({
            ...rec,
            status: SegmentStatus.REPLAYED,
            sequenceReason: SequenceAnomalyReason.DUPLICATE,
            timestamp: Date.now(),
          });
          this.previousWasReplayed.set(key, true);
        }
      }
    }

    if (status === SegmentStatus.REORDERED) {
      // isFirst of the same track can arrive as WARNING (gap_detected) or INVALID (broken hash)
      // instead of REORDERED (out_of_order) when CML's SequenceTracker resets or when MFHD
      // patching breaks the BMFF hash. Detect the forward-reorder pattern: prevRecord is
      // WARNING/INVALID at exactly currentSeq + 1. Upgrade it retroactively and cascade to
      // companion tracks at that seq number.
      //
      // Audio and video isSecond process independently. Audio is smaller so audio isSecond often
      // completes before video isSecond. After audio isSecond runs, lastVsiRecord[audioKey] moves
      // from isFirstSeq to isSecondSeq. prevLastVsiRecord retains the previous entry so video
      // isSecond's cascade can still find and upgrade audio isFirst.
      if (
        (prevRecord?.status === SegmentStatus.WARNING || prevRecord?.status === SegmentStatus.INVALID) &&
        prevRecord.segmentNumber === vsiResult.sequenceNumber + 1
      ) {
        const upgradedIsFirst = { ...prevRecord, status: SegmentStatus.REORDERED, timestamp: Date.now() };
        this.emitSegmentValidated(upgradedIsFirst);
        this.setVsiRecord(streamKey, upgradedIsFirst);
        this.previousWasReplayed.set(streamKey, true);

        const isFirstSeq = prevRecord.segmentNumber;
        const upgradedKeys = new Set<string>();
        const tryUpgradeCompanion = (key: string, rec: SegmentRecord) => {
          if (upgradedKeys.has(key)) return;
          if (
            !key.startsWith(`${mediaType}-`) &&
            rec.segmentNumber === isFirstSeq &&
            (rec.status === SegmentStatus.INVALID || rec.status === SegmentStatus.WARNING)
          ) {
            const upgraded = { ...rec, status: SegmentStatus.REORDERED, timestamp: Date.now() };
            this.emitSegmentValidated(upgraded);
            // Update the map that owns the record at isFirstSeq without disturbing the other.
            if (this.lastVsiRecord.get(key)?.segmentNumber === isFirstSeq) {
              this.setVsiRecord(key, upgraded);
            } else {
              this.prevLastVsiRecord.set(key, upgraded);
            }
            this.previousWasReplayed.set(key, true);
            upgradedKeys.add(key);
          }
        };
        for (const [key, rec] of [...this.lastVsiRecord.entries()]) tryUpgradeCompanion(key, rec);
        for (const [key, rec] of [...this.prevLastVsiRecord.entries()]) tryUpgradeCompanion(key, rec);
      }

      // Audio resolves before video (smaller payload → faster XHR). When video becomes REORDERED
      // retroactively upgrade companion tracks that already emitted INVALID/WARNING at the same seq.
      for (const [key, rec] of this.lastVsiRecord.entries()) {
        if (
          !key.startsWith(`${mediaType}-`) &&
          rec.segmentNumber === vsiResult.sequenceNumber &&
          (rec.status === SegmentStatus.INVALID || rec.status === SegmentStatus.WARNING)
        ) {
          const upgraded = { ...rec, status: SegmentStatus.REORDERED, timestamp: Date.now() };
          this.emitSegmentValidated(upgraded);
          this.setVsiRecord(key, upgraded);
          this.previousWasReplayed.set(key, true);
        }
      }
    }

    this.previousWasReplayed.set(
      streamKey,
      status === SegmentStatus.REPLAYED || status === SegmentStatus.REORDERED,
    );

    const record = buildVsiSegmentRecord(vsiResult, mediaType, status, this.deps.manifest.value);
    this.setVsiRecord(streamKey, record);
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

  private setVsiRecord(key: string, record: SegmentRecord): void {
    const prev = this.lastVsiRecord.get(key);
    if (prev !== undefined) this.prevLastVsiRecord.set(key, prev);
    this.lastVsiRecord.set(key, record);
  }

  private emitSegmentValidated(record: SegmentRecord): void {
    this.deps.eventBus.emit('segmentValidated', record);
  }
}
