import { describe, it, expect } from 'vitest';
import { parseISODurationToMs } from '../utils/parseISODuration.js';

describe('parseISODurationToMs', () => {
  it('parses seconds only', () => {
    expect(parseISODurationToMs('PT4S')).toBe(4000);
  });

  it('parses fractional seconds', () => {
    expect(parseISODurationToMs('PT3.96S')).toBe(3960);
  });

  it('parses minutes and seconds', () => {
    expect(parseISODurationToMs('PT1M30S')).toBe(90_000);
  });

  it('parses hours, minutes, and seconds', () => {
    expect(parseISODurationToMs('PT1H2M3S')).toBe(3_723_000);
  });

  it('parses minutes only', () => {
    expect(parseISODurationToMs('PT5M')).toBe(300_000);
  });

  it('parses hours only', () => {
    expect(parseISODurationToMs('PT2H')).toBe(7_200_000);
  });

  it('returns default 12000ms for unparseable input', () => {
    expect(parseISODurationToMs('garbage')).toBe(12_000);
  });

  it('returns default 12000ms for empty string', () => {
    expect(parseISODurationToMs('')).toBe(12_000);
  });
});
