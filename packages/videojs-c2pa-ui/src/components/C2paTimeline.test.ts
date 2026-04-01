import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { C2paTimeline, formatTime } from './C2paTimeline.js';
import type { VjsComponent, VideoJsPlayer } from '../types.js';

// --- Helpers ---

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function makeControlBar(container: HTMLElement): VjsComponent {
  return { el: () => container };
}

function makePlayer(durationValue = 100): VideoJsPlayer {
  // Create a detached DOM tree that exposes .vjs-play-progress and .c2pa-menu-button
  const playerEl = document.createElement('div');
  playerEl.innerHTML = `
    <div class="vjs-play-progress"></div>
    <div class="c2pa-menu-button"><button></button></div>
  `;
  return {
    el: () => playerEl,
    currentTime: () => 0,
    duration: () => durationValue,
    play: async () => {},
    pause: () => {},
    on: () => {},
    controlBar: null as unknown as VideoJsPlayer['controlBar'],
  };
}

// --- formatTime ---

describe('formatTime', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatTime(65)).toBe('01:05');
  });

  it('formats 3600 seconds as 60:00', () => {
    expect(formatTime(3600)).toBe('60:00');
  });

  it('rounds fractional seconds', () => {
    expect(formatTime(1.7)).toBe('00:02');
  });

  it('pads single-digit minutes and seconds', () => {
    expect(formatTime(9)).toBe('00:09');
    expect(formatTime(60)).toBe('01:00');
  });
});

// --- C2paTimeline ---

describe('C2paTimeline', () => {
  let timeline: C2paTimeline;
  let container: HTMLElement;

  beforeEach(() => {
    timeline = new C2paTimeline();
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  describe('onValidationStatusChanged', () => {
    it('creates the first segment when timeline is empty', () => {
      timeline.onValidationStatusChanged(true, 5, container);

      expect(container.children).toHaveLength(1);
      const segment = container.children[0] as HTMLElement;
      expect(segment.dataset.verificationStatus).toBe('true');
      expect(segment.dataset.startTime).toBe('5');
    });

    it('does not add a new segment when status is unchanged', () => {
      timeline.onValidationStatusChanged(true, 5, container);
      timeline.onValidationStatusChanged(true, 10, container);

      expect(container.children).toHaveLength(1);
    });

    it('creates a new segment when status changes', () => {
      timeline.onValidationStatusChanged(true, 5, container);
      timeline.onValidationStatusChanged(false, 10, container);

      expect(container.children).toHaveLength(2);
      const second = container.children[1] as HTMLElement;
      expect(second.dataset.verificationStatus).toBe('false');
    });

    it('closes the previous segment at the transition time', () => {
      timeline.onValidationStatusChanged(true, 0, container);
      timeline.onValidationStatusChanged(false, 8, container);

      const first = container.children[0] as HTMLElement;
      expect(first.dataset.endTime).toBe('8');
    });

    it('treats undefined verified as "unknown" status', () => {
      timeline.onValidationStatusChanged(undefined, 0, container);

      const segment = container.children[0] as HTMLElement;
      expect(segment.dataset.verificationStatus).toBe('unknown');
    });
  });

  describe('reset', () => {
    it('removes all segment DOM nodes', () => {
      timeline.onValidationStatusChanged(true, 0, container);
      timeline.onValidationStatusChanged(false, 5, container);

      timeline.reset();

      expect(container.children).toHaveLength(0);
    });

    it('allows new segments to be added after reset', () => {
      timeline.onValidationStatusChanged(true, 0, container);
      timeline.reset();
      timeline.onValidationStatusChanged(false, 0, container);

      expect(container.children).toHaveLength(1);
      const segment = container.children[0] as HTMLElement;
      expect(segment.dataset.verificationStatus).toBe('false');
    });
  });

  describe('getCompromisedRegions — monolithic mode', () => {
    it('returns empty array when no segments are invalid', () => {
      timeline.onValidationStatusChanged(true, 0, container);
      const player = makePlayer(60);

      expect(timeline.getCompromisedRegions(true, player)).toEqual([]);
    });

    it('returns one region covering the full duration when first segment is invalid', () => {
      timeline.onValidationStatusChanged(false, 0, container);
      const player = makePlayer(60);

      const regions = timeline.getCompromisedRegions(true, player);
      expect(regions).toHaveLength(1);
      expect(regions[0]).toBe('00:00-01:00');
    });
  });

  describe('getCompromisedRegions — streaming mode', () => {
    it('returns empty array when no invalid segments exist', () => {
      timeline.onValidationStatusChanged(true, 0, container);
      const player = makePlayer(60);

      expect(timeline.getCompromisedRegions(false, player)).toEqual([]);
    });

    it('returns formatted time range for each invalid segment', () => {
      // valid: 0-5, invalid: 5-10
      timeline.onValidationStatusChanged(true, 0, container);
      timeline.onValidationStatusChanged(false, 5, container);

      // Manually advance end time of the invalid segment (normally done by updateTimeline)
      const invalidSegment = container.children[1] as HTMLElement;
      invalidSegment.dataset.endTime = '10';

      const player = makePlayer(60);
      const regions = timeline.getCompromisedRegions(false, player);

      expect(regions).toHaveLength(1);
      expect(regions[0]).toBe('00:05-00:10');
    });

    it('reports multiple disjoint invalid segments', () => {
      // valid 0-5, invalid 5-10, valid 10-15, invalid 15-20
      timeline.onValidationStatusChanged(true, 0, container);
      timeline.onValidationStatusChanged(false, 5, container);
      const invalid1 = container.children[1] as HTMLElement;
      invalid1.dataset.startTime = '5';
      invalid1.dataset.endTime = '10';

      timeline.onValidationStatusChanged(true, 10, container);
      timeline.onValidationStatusChanged(false, 15, container);
      const invalid2 = container.children[3] as HTMLElement;
      invalid2.dataset.startTime = '15';
      invalid2.dataset.endTime = '20';

      const player = makePlayer(60);
      const regions = timeline.getCompromisedRegions(false, player);

      expect(regions).toHaveLength(2);
      expect(regions[0]).toBe('00:05-00:10');
      expect(regions[1]).toBe('00:15-00:20');
    });
  });

  describe('onSeeking', () => {
    it('returns seeking=false and resets timeline when currentTime is 0', () => {
      timeline.onValidationStatusChanged(true, 5, container);
      const player = makePlayer();
      const controlBar = makeControlBar(container);

      const result = timeline.onSeeking(0, true, 5, false, controlBar, player);

      expect(result.seeking).toBe(false);
      expect(result.lastPlaybackTime).toBe(0);
      expect(container.children).toHaveLength(0);
    });

    it('returns seeking=true when seeking to a valid time', () => {
      timeline.onValidationStatusChanged(true, 0, container);
      const player = makePlayer();
      const controlBar = makeControlBar(container);

      const result = timeline.onSeeking(10, true, 5, false, controlBar, player);

      expect(result.seeking).toBe(true);
    });
  });
});
