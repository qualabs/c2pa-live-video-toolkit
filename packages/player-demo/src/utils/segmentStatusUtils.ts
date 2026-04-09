import type { SegmentStatus } from '@c2pa-live-toolkit/dashjs-plugin';

export function statusIcon(status: SegmentStatus): string {
  switch (status) {
    case 'valid':
      return '✓';
    case 'replayed':
      return '♻';
    case 'reordered':
      return '↕';
    case 'missing':
      return '⊘';
    case 'invalid':
      return '✗';
    case 'warning':
      return '⚠';
    case 'ad':
      return '▶';
  }
}

export function statusText(status: SegmentStatus): string {
  switch (status) {
    case 'valid':
      return 'OK';
    case 'replayed':
      return 'Replayed';
    case 'reordered':
      return 'Reordered';
    case 'missing':
      return 'Missing Segment Detected';
    case 'invalid':
      return 'NOK';
    case 'warning':
      return 'Warning';
    case 'ad':
      return 'No C2PA';
  }
}

export function statusCategory(status: SegmentStatus): 'valid' | 'failed' | 'warning' | 'ad' {
  switch (status) {
    case 'valid':
      return 'valid';
    case 'replayed':
    case 'reordered':
    case 'invalid':
      return 'failed';
    case 'missing':
    case 'warning':
      return 'warning';
    case 'ad':
      return 'ad';
  }
}
