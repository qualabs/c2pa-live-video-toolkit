import { SegmentStatus } from '../types.js';
import type { SegmentRecord, SegmentStatusValue } from '../types.js';

const SEQUENCE_ANOMALY_STATUSES: SegmentStatusValue[] = [
  SegmentStatus.REPLAYED,
  SegmentStatus.REORDERED,
  SegmentStatus.MISSING,
  SegmentStatus.WARNING,
  SegmentStatus.AD,
];

function isSequenceAnomaly(status: SegmentStatusValue): boolean {
  return SEQUENCE_ANOMALY_STATUSES.includes(status);
}

function isSameSegment(existing: SegmentRecord, incoming: SegmentRecord): boolean {
  return (
    existing.segmentNumber === incoming.segmentNumber &&
    existing.sequenceNumber === incoming.sequenceNumber &&
    existing.mediaType === incoming.mediaType &&
    existing.keyId === incoming.keyId &&
    existing.hash === incoming.hash
  );
}

export class SegmentStore {
  private segments: SegmentRecord[] = [];
  private arrivalCounter = 0;
  private readonly maxStoredSegments: number;

  constructor(maxStoredSegments: number) {
    this.maxStoredSegments = maxStoredSegments;
  }

  add(segment: Omit<SegmentRecord, 'arrivalIndex'>, forceNewArrival = false): SegmentRecord {
    const existingIndex = this.segments.findIndex((s) =>
      isSameSegment(s, segment as SegmentRecord),
    );

    let stored: SegmentRecord;
    if (existingIndex !== -1 && forceNewArrival) {
      stored = { ...segment, arrivalIndex: this.arrivalCounter++ };
      this.segments.push(stored);
    } else if (existingIndex !== -1) {
      const existing = this.segments[existingIndex];
      const preserveStatus = isSequenceAnomaly(existing.status);
      stored = {
        ...existing,
        ...segment,
        arrivalIndex: existing.arrivalIndex,
        status: preserveStatus ? existing.status : segment.status,
        sequenceReason: existing.sequenceReason ?? segment.sequenceReason,
      };
      this.segments[existingIndex] = stored;
    } else {
      stored = { ...segment, arrivalIndex: this.arrivalCounter++ };
      this.segments.push(stored);
    }

    this.pruneIfNeeded();
    return stored;
  }

  getAll(): SegmentRecord[] {
    return [...this.segments];
  }

  getLast(): SegmentRecord | undefined {
    return this.segments.at(-1);
  }

  clear(): void {
    this.segments = [];
    this.arrivalCounter = 0;
  }

  private pruneIfNeeded(): void {
    if (this.segments.length > this.maxStoredSegments) {
      this.segments = this.segments.slice(-this.maxStoredSegments);
    }
  }
}
