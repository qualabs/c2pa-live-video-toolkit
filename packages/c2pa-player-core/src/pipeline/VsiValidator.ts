import { validateC2paSegment } from '@svta/cml-c2pa';
import type { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { SequenceTracker } from '../state/SequenceTracker.js';
import type { SequenceAnomalyReasonValue } from '../types.js';

export type VsiValidationResult = {
  isValid: boolean;
  sequenceReason: SequenceAnomalyReasonValue | null;
  bmffHashHex: string | null;
  kidHex: string | null;
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
      isValid: result.isValid && sequenceResult.isValid,
      sequenceReason: (sequenceResult.reason as SequenceAnomalyReasonValue) ?? null,
      bmffHashHex: result.bmffHashHex,
      kidHex: result.kidHex,
      sequenceNumber: result.sequenceNumber,
      errorCodes: result.errorCodes,
    };
  }
}
