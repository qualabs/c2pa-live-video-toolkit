export interface SegmentEntry {
  '@_r'?: string;
}

export interface SegmentTimeline {
  S: SegmentEntry | SegmentEntry[];
}

export interface SegmentTemplate {
  '@_media': string;
  '@_initialization': string;
  '@_startNumber': string;
  SegmentTimeline?: SegmentTimeline;
}

export interface Representation {
  '@_id': string;
  SegmentTemplate?: SegmentTemplate;
}

export interface AdaptationSet {
  SegmentTemplate?: SegmentTemplate;
  Representation: Representation | Representation[];
}

export interface ParsedMpd {
  MPD: {
    '@_publishTime'?: string;
    '@_minimumUpdatePeriod'?: string;
    Period: {
      AdaptationSet: AdaptationSet | AdaptationSet[];
    };
  };
}
