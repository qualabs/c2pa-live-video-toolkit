import type { SequenceState } from '@svta/cml-c2pa';

export class SequenceTracker {
  private readonly streamStates = new Map<string, SequenceState>();

  getState(streamKey: string): SequenceState | undefined {
    return this.streamStates.get(streamKey);
  }

  setState(streamKey: string, state: SequenceState): void {
    this.streamStates.set(streamKey, state);
  }

  clearAll(): void {
    this.streamStates.clear();
  }
}
