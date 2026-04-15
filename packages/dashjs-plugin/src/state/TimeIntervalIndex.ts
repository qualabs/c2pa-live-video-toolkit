import IntervalTreeDefault from '@flatten-js/interval-tree';

// @flatten-js/interval-tree ships as CJS; double-cast via unknown for ESM interop

const IntervalTreeConstructor = IntervalTreeDefault as unknown as new () => IntervalTreeApi;

type TimeInterval = [number, number];

type SegmentTimeEntry = {
  type: string;
  manifest: unknown;
  interval: TimeInterval;
  valid: boolean;
};

type IntervalTreeApi = {
  insert: (key: TimeInterval, value: SegmentTimeEntry) => void;
  remove: (key: TimeInterval, value: SegmentTimeEntry) => void;
  search: (key: TimeInterval) => SegmentTimeEntry[];
};

export class TimeIntervalIndex {
  private readonly trees = new Map<string, IntervalTreeApi>();

  ensureStream(streamKey: string): void {
    if (!this.trees.has(streamKey)) {
      this.trees.set(streamKey, new IntervalTreeConstructor());
    }
  }

  insert(streamKey: string, interval: TimeInterval, entry: SegmentTimeEntry): void {
    this.ensureStream(streamKey);
    const tree = this.trees.get(streamKey)!;

    // Remove any existing entry at the exact same interval before inserting
    const existing = tree.search(interval) as SegmentTimeEntry[];
    for (const seg of existing) {
      if (seg.interval[0] === interval[0] && seg.interval[1] === interval[1]) {
        tree.remove(interval, seg);
      }
    }

    tree.insert(interval, entry);
  }

  search(streamKey: string, interval: TimeInterval): SegmentTimeEntry[] {
    const tree = this.trees.get(streamKey);
    if (!tree) return [];
    return tree.search(interval) as SegmentTimeEntry[];
  }

  hasStream(streamKey: string): boolean {
    return this.trees.has(streamKey);
  }

  clear(): void {
    this.trees.clear();
  }
}
