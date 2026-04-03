import type { SegmentRecord, SegmentStatus } from '../types.js';

type Unsubscribe = () => void;
type StoreListener = (segments: SegmentRecord[]) => void;

const SEQUENCE_ANOMALY_STATUSES: SegmentStatus[] = ['replayed', 'reordered', 'missing', 'warning'];

function isSequenceAnomaly(status: SegmentStatus): boolean {
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
  private listeners: StoreListener[] = [];
  private arrivalCounter = 0;
  private readonly maxStoredSegments: number;

  constructor(maxStoredSegments: number) {
    this.maxStoredSegments = maxStoredSegments;
  }

  add(segment: Omit<SegmentRecord, 'arrivalIndex'>, forceNewArrival = false): void {
    const existingIndex = this.segments.findIndex((s) =>
      isSameSegment(s, segment as SegmentRecord),
    );

    if (existingIndex !== -1 && forceNewArrival) {
      this.segments.push({ ...segment, arrivalIndex: this.arrivalCounter++ });
    } else if (existingIndex !== -1) {
      const existing = this.segments[existingIndex];
      const preserveStatus = isSequenceAnomaly(existing.status);
      this.segments[existingIndex] = {
        ...existing,
        ...segment,
        arrivalIndex: existing.arrivalIndex,
        status: preserveStatus ? existing.status : segment.status,
        sequenceReason: existing.sequenceReason ?? segment.sequenceReason,
      };
    } else {
      this.segments.push({ ...segment, arrivalIndex: this.arrivalCounter++ });
    }

    this.pruneIfNeeded();
    this.notify();
  }

  getAll(): SegmentRecord[] {
    return [...this.segments];
  }

  getLast(): SegmentRecord | undefined {
    return this.segments.at(-1);
  }

  subscribe(listener: StoreListener): Unsubscribe {
    this.listeners.push(listener);
    listener([...this.segments]);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  clear(): void {
    this.segments = [];
    this.arrivalCounter = 0;
    this.notify();
  }

  private pruneIfNeeded(): void {
    if (this.segments.length > this.maxStoredSegments) {
      this.segments = this.segments.slice(-this.maxStoredSegments);
    }
  }

  private notify(): void {
    const snapshot = [...this.segments];
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
