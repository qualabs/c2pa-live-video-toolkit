import { SegmentStatus } from '@c2pa-live-toolkit/dashjs-plugin';
import type { SegmentStatusValue } from '@c2pa-live-toolkit/dashjs-plugin';

export function statusIcon(status: SegmentStatusValue): string {
  switch (status) {
    case SegmentStatus.VALID:
      return '✓';
    case SegmentStatus.REPLAYED:
      return '♻';
    case SegmentStatus.REORDERED:
      return '↕';
    case SegmentStatus.MISSING:
      return '⊘';
    case SegmentStatus.INVALID:
      return '✗';
    case SegmentStatus.WARNING:
      return '⚠';
    case SegmentStatus.AD:
      return '▶';
  }
}

export function statusText(status: SegmentStatusValue): string {
  switch (status) {
    case SegmentStatus.VALID:
      return 'OK';
    case SegmentStatus.REPLAYED:
      return 'Replayed';
    case SegmentStatus.REORDERED:
      return 'Reordered';
    case SegmentStatus.MISSING:
      return 'Missing Segment Detected';
    case SegmentStatus.INVALID:
      return 'NOK';
    case SegmentStatus.WARNING:
      return 'Warning';
    case SegmentStatus.AD:
      return 'No C2PA';
  }
}

export function statusCategory(status: SegmentStatusValue): 'valid' | 'failed' | 'warning' | 'ad' {
  switch (status) {
    case SegmentStatus.VALID:
      return 'valid';
    case SegmentStatus.REPLAYED:
    case SegmentStatus.REORDERED:
    case SegmentStatus.INVALID:
      return 'failed';
    case SegmentStatus.MISSING:
    case SegmentStatus.WARNING:
      return 'warning';
    case SegmentStatus.AD:
      return 'ad';
  }
}
