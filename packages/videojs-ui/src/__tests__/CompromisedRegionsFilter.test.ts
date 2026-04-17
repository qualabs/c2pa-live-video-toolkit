import { describe, it, expect } from 'vitest';
import { filterRecentCompromisedRegions } from '../CompromisedRegionsFilter.js';

describe('filterRecentCompromisedRegions', () => {
  const regions = ['01:00-01:30', '05:00-05:15', '18:00-18:30', '25:00-25:10'];

  it('returns all regions in monolithic mode regardless of time', () => {
    const result = filterRecentCompromisedRegions(regions, true, 0);
    expect(result).toEqual(regions);
  });

  it('filters out regions older than 20 minutes from currentTime', () => {
    // currentTime = 25:10 (1510s), cutoff = 1510 - 1200 = 310s (5:10)
    // 01:00 (60s) < cutoff, 05:00 (300s) < cutoff → both filtered out
    const result = filterRecentCompromisedRegions(regions, false, 1510);
    expect(result).toEqual(['18:00-18:30', '25:00-25:10']);
  });

  it('returns only recent regions based on the 20-minute window', () => {
    // currentTime = 30:00 (1800s), cutoff = 1800 - 1200 = 600s (10:00)
    const result = filterRecentCompromisedRegions(regions, false, 1800);
    expect(result).toEqual(['18:00-18:30', '25:00-25:10']);
  });

  it('returns empty array when all regions are older than 20 minutes', () => {
    // currentTime = 50:00 (3000s), cutoff = 3000 - 1200 = 1800s (30:00)
    const result = filterRecentCompromisedRegions(regions, false, 3000);
    expect(result).toEqual([]);
  });

  it('returns all regions when currentTime is small', () => {
    // currentTime = 60s, cutoff = max(0, 60-1200) = 0
    const result = filterRecentCompromisedRegions(regions, false, 60);
    expect(result).toEqual(regions);
  });

  it('returns empty array for empty input', () => {
    expect(filterRecentCompromisedRegions([], false, 1000)).toEqual([]);
  });
});
