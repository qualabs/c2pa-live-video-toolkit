const TWENTY_MINUTES_IN_SECONDS = 20 * 60;

export function filterRecentCompromisedRegions(
  allRegions: string[],
  isMonolithic: boolean,
  currentTime: number,
): string[] {
  if (isMonolithic) return allRegions;

  const cutoffTime = Math.max(0, currentTime - TWENTY_MINUTES_IN_SECONDS);

  return allRegions.filter((region) => {
    const [startStr] = region.split('-');
    const [minutes, seconds] = startStr.split(':').map(Number);
    return minutes * 60 + seconds >= cutoffTime;
  });
}
