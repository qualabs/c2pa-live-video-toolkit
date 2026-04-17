import type { C2paManifest } from '@svta/cml-c2pa';

export type MediaType = 'video' | 'audio';

export type MutableRef<T> = { value: T };

/**
 * Re-export the CML manifest type so consumers don't need a direct CML dependency
 * just to reference the manifest shape.
 */
export type { C2paManifest };

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

export const SegmentStatus = {
  VALID: 'valid',
  INVALID: 'invalid',
  REPLAYED: 'replayed',
  REORDERED: 'reordered',
  MISSING: 'missing',
  WARNING: 'warning',
  UNVERIFIED: 'unverified',
} as const;

export type SegmentStatusValue = (typeof SegmentStatus)[keyof typeof SegmentStatus];

export const SequenceAnomalyReason = {
  DUPLICATE: 'duplicate',
  OUT_OF_ORDER: 'out_of_order',
  GAP_DETECTED: 'gap_detected',
  SEQUENCE_NUMBER_BELOW_MINIMUM: 'sequence_number_below_minimum',
} as const;

export type SequenceAnomalyReasonValue =
  (typeof SequenceAnomalyReason)[keyof typeof SequenceAnomalyReason];

export type SegmentRecord = {
  segmentNumber: number;
  mediaType: MediaType;
  keyId: string | null;
  hash: string | null;
  status: SegmentStatusValue;
  sequenceReason?: SequenceAnomalyReasonValue;
  errorCodes?: readonly ValidationErrorCode[];
  timestamp: number;
  manifest?: C2paManifest | null;
  previousManifestId?: string | null;
  /** First missing sequence number when this segment detected a gap (inclusive). */
  sequenceMissingFrom?: number;
  /** Last missing sequence number when this segment detected a gap (inclusive). */
  sequenceMissingTo?: number;
};

export type InitProcessedEvent = {
  success: boolean;
  sessionKeysCount: number;
  manifestId: string | undefined;
  manifest: C2paManifest | null;
  errorCodes?: readonly ValidationErrorCode[];
  error?: string;
};

export type ErrorEvent = {
  source: string;
  error: unknown;
};

export type C2paEventMap = {
  segmentValidated: SegmentRecord;
  initProcessed: InitProcessedEvent;
  error: ErrorEvent;
};

export type C2paEventType = keyof C2paEventMap;

export const C2paEvent = {
  SEGMENT_VALIDATED: 'segmentValidated',
  INIT_PROCESSED: 'initProcessed',
  ERROR: 'error',
} as const satisfies Record<string, C2paEventType>;

export type Logger = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type C2paOptions = {
  mediaTypes?: MediaType[];
  logger?: Logger | false;
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
  [ValidationErrorCode.INGREDIENT_MISMATCH]: 'Action requires ingredient reference but none found',
  [ValidationErrorCode.SIGNATURE_MISMATCH]: 'Claim signature verification failed',
};

export const DEFAULT_MEDIA_TYPES: MediaType[] = ['video', 'audio'];

export function isMediaType(type: string): type is MediaType {
  return type === 'video' || type === 'audio';
}

/**
 * Narrows CML's `string[]` error codes to the known `ValidationErrorCode` union.
 * CML returns string[] — this single cast point avoids `as` scattered across call sites.
 */
export function asValidationErrorCodes(
  codes?: readonly string[],
): ValidationErrorCode[] | undefined {
  return codes as ValidationErrorCode[] | undefined;
}
