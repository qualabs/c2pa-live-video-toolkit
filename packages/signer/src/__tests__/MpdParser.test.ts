import { describe, it, expect } from 'vitest';
import { MpdParser } from '../mpd/MpdParser.js';

const MINIMAL_MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     publishTime="2025-04-16T12:00:00Z"
     minimumUpdatePeriod="PT4S">
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="chunk-$RepresentationID$-$Number%05d$.m4s"
                       initialization="init-$RepresentationID$.m4s"
                       startNumber="1">
        <SegmentTimeline>
          <S d="96000" r="2"/>
        </SegmentTimeline>
      </SegmentTemplate>
      <Representation id="0" bandwidth="500000"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const MPD_MULTIPLE_ADAPTATION_SETS = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" publishTime="2025-04-16T12:00:00Z">
  <Period>
    <AdaptationSet>
      <SegmentTemplate media="video-$Number$.m4s" initialization="video-init.m4s" startNumber="1"/>
      <Representation id="v0"/>
    </AdaptationSet>
    <AdaptationSet>
      <SegmentTemplate media="audio-$Number$.m4s" initialization="audio-init.m4s" startNumber="1"/>
      <Representation id="a0"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const MPD_NO_PUBLISH_TIME = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet>
      <Representation id="0"/>
    </AdaptationSet>
  </Period>
</MPD>`;

describe('MpdParser', () => {
  const parser = new MpdParser();

  describe('parse', () => {
    it('parses valid MPD XML without throwing', () => {
      expect(() => parser.parse(MINIMAL_MPD)).not.toThrow();
    });

    it('returns an object with MPD root', () => {
      const parsed = parser.parse(MINIMAL_MPD);
      expect(parsed.MPD).toBeDefined();
    });
  });

  describe('extractPublishTime', () => {
    it('extracts publishTime from a valid MPD', () => {
      const parsed = parser.parse(MINIMAL_MPD);
      expect(parser.extractPublishTime(parsed)).toBe('2025-04-16T12:00:00Z');
    });

    it('returns null when publishTime is absent', () => {
      const parsed = parser.parse(MPD_NO_PUBLISH_TIME);
      expect(parser.extractPublishTime(parsed)).toBeNull();
    });
  });

  describe('extractMinimumUpdatePeriod', () => {
    it('extracts minimumUpdatePeriod from a valid MPD', () => {
      const parsed = parser.parse(MINIMAL_MPD);
      expect(parser.extractMinimumUpdatePeriod(parsed)).toBe('PT4S');
    });

    it('returns null when minimumUpdatePeriod is absent', () => {
      const parsed = parser.parse(MPD_NO_PUBLISH_TIME);
      expect(parser.extractMinimumUpdatePeriod(parsed)).toBeNull();
    });
  });

  describe('extractAdaptationSets', () => {
    it('returns a single AdaptationSet as an array', () => {
      const parsed = parser.parse(MINIMAL_MPD);
      const sets = parser.extractAdaptationSets(parsed);
      expect(sets).toHaveLength(1);
    });

    it('returns multiple AdaptationSets', () => {
      const parsed = parser.parse(MPD_MULTIPLE_ADAPTATION_SETS);
      const sets = parser.extractAdaptationSets(parsed);
      expect(sets).toHaveLength(2);
    });

    it('returns empty array when no AdaptationSet is present', () => {
      const xml = `<MPD><Period></Period></MPD>`;
      const parsed = parser.parse(xml);
      expect(parser.extractAdaptationSets(parsed)).toEqual([]);
    });

    it('extracts SegmentTemplate attributes', () => {
      const parsed = parser.parse(MINIMAL_MPD);
      const sets = parser.extractAdaptationSets(parsed);
      const template = sets[0].SegmentTemplate;
      expect(template?.['@_media']).toBe('chunk-$RepresentationID$-$Number%05d$.m4s');
      expect(template?.['@_initialization']).toBe('init-$RepresentationID$.m4s');
      expect(template?.['@_startNumber']).toBe('1');
    });

    it('extracts SegmentTimeline entries', () => {
      const parsed = parser.parse(MINIMAL_MPD);
      const sets = parser.extractAdaptationSets(parsed);
      const timeline = sets[0].SegmentTemplate?.SegmentTimeline;
      expect(timeline).toBeDefined();
      expect(timeline?.S).toBeDefined();
    });
  });
});
