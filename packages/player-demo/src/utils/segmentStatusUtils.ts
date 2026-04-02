import type { SegmentStatus } from '@c2pa-live-toolkit/dashjs-plugin';

export function statusIcon(status: SegmentStatus): string {
  switch (status) {
    case 'valid':     return '✓';
    case 'replayed':  return '♻';
    case 'reordered': return '↕';
    case 'missing':   return '⊘';
    case 'invalid':   return '✗';
    case 'warning':   return '⚠';
  }
}

export function statusText(status: SegmentStatus): string {
  switch (status) {
    case 'valid':     return 'OK';
    case 'replayed':  return 'Replayed';
    case 'reordered': return 'Reordered';
    case 'missing':   return 'Missing Segment Detected';
    case 'invalid':   return 'NOK';
    case 'warning':   return 'Warning';
  }
}

export function statusCategory(status: SegmentStatus): 'valid' | 'failed' | 'warning' {
  switch (status) {
    case 'valid':     return 'valid';
    case 'replayed':
    case 'reordered':
    case 'invalid':   return 'failed';
    case 'missing':
    case 'warning':   return 'warning';
  }
}
