export type MediaType = 'video' | 'audio';

/**
 * Standard C2PA validation status codes for manifest integrity checks,
 * mirroring the values exported by @svta/cml-c2pa so consumers can reference
 * them without importing CML directly.
 *
 * @see C2PA Spec §15.10.3 and §18.15
 */
export type C2paStatusCode =
  | 'assertion.hashedURI.mismatch'
  | 'assertion.missing'
  | 'assertion.action.ingredientMismatch'
  | 'claim.signature.mismatch';

/**
 * All possible error codes that can appear in validation results.
 * Combines live-video specific codes (§19.7) and standard C2PA integrity codes (§15/§18).
 */
export type ValidationErrorCode =
  | 'livevideo.init.invalid'
  | 'livevideo.manifest.invalid'
  | 'livevideo.segment.invalid'
  | 'livevideo.assertion.invalid'
  | 'livevideo.continuityMethod.invalid'
  | 'livevideo.sessionkey.invalid'
  | C2paStatusCode;

export type SegmentStatus = 'valid' | 'invalid' | 'replayed' | 'reordered' | 'missing' | 'warning';

export type SequenceAnomalyReason =
  | 'duplicate'
  | 'out_of_order'
  | 'gap_detected'
  | 'sequence_number_below_minimum';

export type SegmentRecord = {
  segmentNumber: number;
  mediaType: MediaType;
  sequenceNumber: number;
  keyId: string;
  hash: string;
  status: SegmentStatus;
  sequenceReason?: SequenceAnomalyReason;
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
  status: SegmentStatus;
  sequenceReason?: SequenceAnomalyReason;
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
  'livevideo.init.invalid': 'Init segment is invalid (contains mdat box)',
  'livevideo.manifest.invalid': 'C2PA manifest failed validation',
  'livevideo.segment.invalid': 'Cryptographic verification failed (signature, hash, or key)',
  'livevideo.assertion.invalid':
    'Live video assertion invalid (sequenceNumber or streamId mismatch)',
  'livevideo.continuityMethod.invalid':
    'Continuity chain broken (previousManifestId mismatch or continuityMethod absent)',
  'livevideo.sessionkey.invalid': 'Session key is invalid or expired',
  // C2PA standard integrity codes (§15 / §18)
  'assertion.hashedURI.mismatch': 'Assertion hash does not match the signed claim',
  'assertion.missing': 'Assertion referenced in claim is missing from manifest store',
  'assertion.action.ingredientMismatch': 'Action requires ingredient reference but none found',
  'claim.signature.mismatch': 'Claim signature verification failed',
};

export const DEFAULT_MEDIA_TYPES: MediaType[] = ['video', 'audio'];
export const DEFAULT_MAX_STORED_SEGMENTS = 1000;
export const PLAYBACK_SEARCH_WINDOW_SECONDS = 0.01;
