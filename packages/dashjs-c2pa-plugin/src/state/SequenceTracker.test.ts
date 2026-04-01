import { describe, it, expect } from 'vitest';
import { SequenceTracker } from './SequenceTracker.js';
import type { SequenceState } from '@svta/cml-c2pa';

function makeState(lastSequenceNumber: number): SequenceState {
  return { lastSequenceNumber } as unknown as SequenceState;
}

describe('SequenceTracker', () => {
  it('returns undefined for an unknown stream key', () => {
    expect(new SequenceTracker().getState('video-default')).toBeUndefined();
  });

  it('stores and retrieves state for a given stream key', () => {
    const tracker = new SequenceTracker();
    const state = makeState(5);
    tracker.setState('video-default', state);
    expect(tracker.getState('video-default')).toBe(state);
  });

  it('clearStream removes only the specified stream', () => {
    const tracker = new SequenceTracker();
    tracker.setState('video-default', makeState(1));
    tracker.setState('audio-default', makeState(2));
    tracker.clearStream('video-default');
    expect(tracker.getState('video-default')).toBeUndefined();
    expect(tracker.getState('audio-default')).toBeDefined();
  });

  it('clearAll removes all streams', () => {
    const tracker = new SequenceTracker();
    tracker.setState('video-default', makeState(1));
    tracker.setState('audio-default', makeState(2));
    tracker.clearAll();
    expect(tracker.getState('video-default')).toBeUndefined();
    expect(tracker.getState('audio-default')).toBeUndefined();
  });
});
