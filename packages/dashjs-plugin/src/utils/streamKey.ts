/**
 * Builds a stable string key identifying a specific stream representation.
 * Used as the lookup key in the time-interval index and sequence tracker.
 *
 * Format: `<mediaType>-<representationId>`
 * Fallbacks: `unknown` for missing mediaType, `default` for missing representationId.
 */
const UNKNOWN_MEDIA_TYPE = 'unknown';
const DEFAULT_REPRESENTATION_ID = 'default';

export function buildStreamKey(
  mediaType: string | null | undefined,
  representationId: string | number | null | undefined,
): string {
  const type = mediaType ?? UNKNOWN_MEDIA_TYPE;
  const id = representationId != null ? String(representationId) : DEFAULT_REPRESENTATION_ID;
  return `${type}-${id}`;
}
