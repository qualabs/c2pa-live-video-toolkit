export interface Job {
  fileKey: string;
  receivedTimestamp?: number;
  enqueueTs?: number;
}

export interface SegmentData {
  hash: string;
  certHash: string;
}

export interface ManifestQueueItem {
  publishTime: string;
  receivedTimestamp: number;
}

const DEFAULT_MPD_POLLING_INTERVAL_MS = 12000;

interface SegmentStore {
  segmentPatterns: Map<string, string>;
  initPatterns: Map<string, string>;
  lastProcessed: Map<string, number>;
  readyLists: Map<string, Job[]>;
  waitingSets: Map<string, Set<string>>;
  segments: Map<string, SegmentData>;
  processedLists: Map<string, string[]>;
  globalWaitingList: Set<string>;
  manifestContent: Map<string, string>;
  manifestRequirements: Map<string, Record<string, number>>;
  manifestQueue: ManifestQueueItem[];
  manifestEnqueued: Set<string>;
  mpdPollingInterval: number;
  // ManifestBox method: last signed manifest URN per representation (for previousManifestId chain)
  previousManifestIds: Map<string, string>;
  // c2patool live-video-sign: path to the last signed segment per representation (for --previous-segment)
  previousSignedSegmentPaths: Map<string, string>;
}

export const segmentStore: SegmentStore = {
  segmentPatterns: new Map<string, string>(),
  initPatterns: new Map<string, string>(),
  lastProcessed: new Map<string, number>(),
  readyLists: new Map<string, Job[]>(),
  waitingSets: new Map<string, Set<string>>(),
  segments: new Map<string, SegmentData>(),
  processedLists: new Map<string, string[]>(),
  globalWaitingList: new Set<string>(),
  manifestContent: new Map<string, string>(),
  manifestRequirements: new Map<string, Record<string, number>>(),
  manifestQueue: [] as ManifestQueueItem[],
  manifestEnqueued: new Set<string>(),
  mpdPollingInterval: DEFAULT_MPD_POLLING_INTERVAL_MS,
  previousManifestIds: new Map<string, string>(),
  previousSignedSegmentPaths: new Map<string, string>(),
};
