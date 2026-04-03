/**
 * Builds a stable string key identifying a specific stream representation.
 * Used as the lookup key in the time-interval index and sequence tracker.
 *
 * Format: `<mediaType>-<representationId>`
 * Fallbacks: `unknown` for missing mediaType, `default` for missing representationId.
 */
export function buildStreamKey(
  mediaType: string | null | undefined,
  representationId: string | number | null | undefined,
): string {
  const type = mediaType ?? 'unknown';
  const id = representationId != null ? String(representationId) : 'default';
  return `${type}-${id}`;
}
