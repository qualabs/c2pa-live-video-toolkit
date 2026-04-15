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
