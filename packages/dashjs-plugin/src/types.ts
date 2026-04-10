export type MediaType = 'video' | 'audio';

// ── Validation error codes ──────────────────────────────────────────
export const ValidationErrorCode = {
  // Live video error codes (§19.7)
  INIT_INVALID: 'livevideo.init.invalid',
  MANIFEST_INVALID: 'livevideo.manifest.invalid',
  SEGMENT_INVALID: 'livevideo.segment.invalid',
  ASSERTION_INVALID: 'livevideo.assertion.invalid',
  CONTINUITY_INVALID: 'livevideo.continuityMethod.invalid',
  SESSION_KEY_INVALID: 'livevideo.sessionkey.invalid',
  // C2PA standard integrity codes (§15 / §18)
  HASHED_URI_MISMATCH: 'assertion.hashedURI.mismatch',
  ASSERTION_MISSING: 'assertion.missing',
  INGREDIENT_MISMATCH: 'assertion.action.ingredientMismatch',
  SIGNATURE_MISMATCH: 'claim.signature.mismatch',
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCode)[keyof typeof ValidationErrorCode];

type C2paStatusCodeKey =
  | 'HASHED_URI_MISMATCH'
  | 'ASSERTION_MISSING'
  | 'INGREDIENT_MISMATCH'
  | 'SIGNATURE_MISMATCH';

export type C2paStatusCode = (typeof ValidationErrorCode)[C2paStatusCodeKey];

export const SegmentStatus = {
  VALID: 'valid',
  INVALID: 'invalid',
  REPLAYED: 'replayed',
  REORDERED: 'reordered',
  MISSING: 'missing',
  WARNING: 'warning',
  AD: 'ad',
} as const;

export type SegmentStatusValue = (typeof SegmentStatus)[keyof typeof SegmentStatus];

export const SequenceAnomalyReason = {
  DUPLICATE: 'duplicate',
  OUT_OF_ORDER: 'out_of_order',
  GAP_DETECTED: 'gap_detected',
  SEQUENCE_NUMBER_BELOW_MINIMUM: 'sequence_number_below_minimum',
} as const;

export type SequenceAnomalyReasonValue = (typeof SequenceAnomalyReason)[keyof typeof SequenceAnomalyReason];

export type SegmentRecord = {
  segmentNumber: number;
  mediaType: MediaType;
  sequenceNumber: number;
  keyId: string;
  hash: string;
  status: SegmentStatusValue;
  sequenceReason?: SequenceAnomalyReasonValue;
  timestamp: number;
  arrivalIndex: number;
  validationResults?: {
    overall: boolean;
    errorCodes?: readonly ValidationErrorCode[];
  };
  manifest?: unknown;
  previousManifestId?: string | null;
};

export type PlaybackStatusDetail = {
  verified: boolean | undefined;
  manifest: unknown;
  error: string | null;
};

export type PlaybackStatus = {
  verified: boolean | undefined;
  details: Partial<Record<MediaType, PlaybackStatusDetail>>;
};

export type InitProcessedEvent = {
  success: boolean;
  sessionKeysCount: number;
  manifestId: string | undefined;
  manifest: unknown;
  errorCodes?: readonly ValidationErrorCode[];
  error?: string;
};

export type SegmentValidatedEvent = {
  segmentNumber: number;
  status: SegmentStatusValue;
  sequenceReason?: SequenceAnomalyReasonValue;
  hash: string;
  keyId: string;
  mediaType: MediaType;
  errorCodes?: readonly ValidationErrorCode[];
};

export type SegmentsMissingEvent = {
  from: number;
  to: number;
  count: number;
};

export type ErrorEvent = {
  source: string;
  error: unknown;
};

export type C2paEventMap = {
  segmentValidated: SegmentValidatedEvent;
  initProcessed: InitProcessedEvent;
  playbackStatus: PlaybackStatus;
  segmentsMissing: SegmentsMissingEvent;
  error: ErrorEvent;
  reset: Record<string, never>;
};

export type C2paEventType = keyof C2paEventMap;

export type Logger = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type C2paOptions = {
  mediaTypes?: MediaType[];
  maxStoredSegments?: number;
  logger?: Logger | false;
  onSegmentValidated?: (record: SegmentRecord) => void;
};

export const ERROR_CODE_MESSAGES: Record<ValidationErrorCode, string> = {
  // Live video status codes (§19.7)
  [ValidationErrorCode.INIT_INVALID]: 'Init segment is invalid (contains mdat box)',
  [ValidationErrorCode.MANIFEST_INVALID]: 'C2PA manifest failed validation',
  [ValidationErrorCode.SEGMENT_INVALID]:
    'Cryptographic verification failed (signature, hash, or key)',
  [ValidationErrorCode.ASSERTION_INVALID]:
    'Live video assertion invalid (sequenceNumber or streamId mismatch)',
  [ValidationErrorCode.CONTINUITY_INVALID]:
    'Continuity chain broken (previousManifestId mismatch or continuityMethod absent)',
  [ValidationErrorCode.SESSION_KEY_INVALID]: 'Session key is invalid or expired',
  // C2PA standard integrity codes (§15 / §18)
  [ValidationErrorCode.HASHED_URI_MISMATCH]: 'Assertion hash does not match the signed claim',
  [ValidationErrorCode.ASSERTION_MISSING]:
    'Assertion referenced in claim is missing from manifest store',
  [ValidationErrorCode.INGREDIENT_MISMATCH]:
    'Action requires ingredient reference but none found',
  [ValidationErrorCode.SIGNATURE_MISMATCH]: 'Claim signature verification failed',
};

export const DEFAULT_MEDIA_TYPES: MediaType[] = ['video', 'audio'];
export const DEFAULT_MAX_STORED_SEGMENTS = 1000;
export const PLAYBACK_SEARCH_WINDOW_SECONDS = 0.01;
