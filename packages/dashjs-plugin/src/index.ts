export { attachC2pa } from './attachC2pa.js';
export { C2paController } from './C2paController.js';
export { ValidationErrorCode, ERROR_CODE_MESSAGES, SegmentStatus, SequenceAnomalyReason, C2paEvent, PlaybackDiagnostic, VerificationStatus } from './types.js';

export type {
  DashjsPlayer,
} from './attachC2pa.js';

export type {
  C2paManifest,
  C2paStatusCode,
  C2paOptions,
  C2paEventMap,
  C2paEventType,
  SegmentRecord,
  SegmentStatusValue,
  SequenceAnomalyReasonValue,
  MediaType,
  MutableRef,
  PlaybackStatus,
  PlaybackStatusDetail,
  PlaybackDiagnosticValue,
  VerificationStatusValue,
  InitProcessedEvent,
  SegmentsMissingEvent,
  ErrorEvent,
  Logger,
} from './types.js';
