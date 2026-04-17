import { REPRESENTATION_ID_PLACEHOLDER } from '../constants.js';

export function resolveInitKey(initPattern: string, representationId: string): string {
  return initPattern.replace(REPRESENTATION_ID_PLACEHOLDER, representationId);
}

/**
 * Resolves a segment pattern template into a concrete file key by replacing
 * $RepresentationID$ and $Number%0Nd$ placeholders with actual values.
 */
export function resolveSegmentKey(
  pattern: string,
  representationId: string,
  segmentNumber: number,
): string {
  return pattern
    .replace(REPRESENTATION_ID_PLACEHOLDER, representationId)
    .replace(/\$Number(?:%0(\d+)d)?\$/, (_: string, padding: string) =>
      padding ? String(segmentNumber).padStart(parseInt(padding, 10), '0') : String(segmentNumber),
    );
}

function escapePatternSpecialChars(pattern: string): string {
  return pattern.replace(/\./g, '\\.').replace(/-/g, '\\-').replace(/\//g, '\\/');
}

function buildSegmentNumberCapture(_fullMatch: string, paddingWidth: string): string {
  return paddingWidth ? `(?<segmentId>\\d{${paddingWidth}})` : `(?<segmentId>\\d+)`;
}

export function extractSegmentInfo(
  fileKey: string,
  pattern: string,
): { repId: string; segmentId: string } | null {
  const regexPattern = escapePatternSpecialChars(pattern)
    .replace(/\$RepresentationID\$/g, '(?<repId>[^\\/-]+)')
    .replace(/\$Number(?:%0(\d+)d)?\$/g, buildSegmentNumberCapture);

  const regex = new RegExp(`^${regexPattern}$`);
  const match = fileKey.match(regex);

  if (match?.groups?.repId && match?.groups?.segmentId) {
    return {
      repId: match.groups.repId,
      segmentId: match.groups.segmentId,
    };
  }

  return null;
}
