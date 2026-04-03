const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const DEFAULT_SEGMENT_DURATION_MS = 12000;

const ISO_DURATION_REGEX = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/;

export function parseISODurationToMs(duration: string): number {
  const match = duration.match(ISO_DURATION_REGEX);
  if (!match) return DEFAULT_SEGMENT_DURATION_MS;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseFloat(match[3] || '0');

  return (hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds) * MS_PER_SECOND;
}
