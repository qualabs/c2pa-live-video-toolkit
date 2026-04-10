import { validateC2paSegment } from '@svta/cml-c2pa';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { SequenceTracker } from '../state/SequenceTracker.js';
import type { SequenceAnomalyReasonValue } from '../types.js';

export type VsiValidationResult = {
  isValid: boolean;
  overall: boolean;
  sequenceReason: SequenceAnomalyReasonValue | null;
  sequenceMissingFrom?: number;
  sequenceMissingTo?: number;
  bmffHashHex: string | null;
  kidHex: string | null;
  manifestId: string;
  sequenceNumber: number;
  errorCodes?: readonly string[];
};

type VsiValidatorDeps = {
  sessionKeyStore: SessionKeyStore;
  sequenceTracker: SequenceTracker;
};

export class VsiValidator {
  private readonly sessionKeyStore: SessionKeyStore;
  private readonly sequenceTracker: SequenceTracker;

  constructor({ sessionKeyStore, sequenceTracker }: VsiValidatorDeps) {
    this.sessionKeyStore = sessionKeyStore;
    this.sequenceTracker = sequenceTracker;
  }

  async validate(segmentBytes: Uint8Array, streamKey: string): Promise<VsiValidationResult | null> {
    const sessionKeys = this.sessionKeyStore.getAll();
    const sequenceState = this.sequenceTracker.getState(streamKey);

    const validated = await validateC2paSegment(segmentBytes, sessionKeys, sequenceState);

    if (!validated) return null;

    const { result, nextSequenceState } = validated;
    this.sequenceTracker.setState(streamKey, nextSequenceState);

    const { sequenceResult } = result;
    return {
      ...result,
      sequenceReason: (sequenceResult.reason as SequenceAnomalyReasonValue) ?? null,
      sequenceMissingFrom: 'missingFrom' in sequenceResult ? sequenceResult.missingFrom : undefined,
      sequenceMissingTo: 'missingTo' in sequenceResult ? sequenceResult.missingTo : undefined,
      overall: result.isValid && sequenceResult.isValid,
    };
  }
}
