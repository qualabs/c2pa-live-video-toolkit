/**
 * End-to-end VOD Merkle tests: synthetic-but-real fMP4 segments with embedded
 * auxiliary Merkle boxes, routed through the full pipeline (real CML, no mocks).
 */
import { describe, it, expect } from 'vitest';
import { createC2paPipeline } from '../createC2paPipeline.js';
import type { C2paPipeline } from '../createC2paPipeline.js';
import { SegmentStatus, ValidationErrorCode } from '../types.js';
import type { InitProcessedEvent, SegmentRecord } from '../types.js';
import { buildMerkleVodStream } from './merkleFixtures.js';

type Harness = {
  pipeline: C2paPipeline;
  records: SegmentRecord[];
  initEvents: InitProcessedEvent[];
};

function buildHarness(): Harness {
  const pipeline = createC2paPipeline({ mediaTypes: ['video'], logger: false });
  const records: SegmentRecord[] = [];
  const initEvents: InitProcessedEvent[] = [];
  pipeline.controller.on('segmentValidated', (record) => records.push(record));
  pipeline.controller.on('initProcessed', (event) => initEvents.push(event));
  return { pipeline, records, initEvents };
}

async function routeInit(harness: Harness, bytes: Uint8Array): Promise<void> {
  await harness.pipeline.route({ kind: 'init', mediaType: 'video', bytes, segmentIndex: 0 });
}

async function routeMedia(harness: Harness, bytes: Uint8Array, index: number): Promise<void> {
  await harness.pipeline.route({ kind: 'media', mediaType: 'video', bytes, segmentIndex: index });
}

describe('VOD Merkle pipeline (end-to-end)', () => {
  it('detects VOD Merkle mode from the init segment (initHash validated)', async () => {
    const { initSegment } = await buildMerkleVodStream(3);
    const harness = buildHarness();

    await routeInit(harness, initSegment);

    expect(harness.initEvents).toHaveLength(1);
    expect(harness.initEvents[0].success).toBe(true);
    expect(harness.initEvents[0].merkleMaps).toHaveLength(1);
    expect(harness.initEvents[0].errorCodes).toEqual([]);
  });

  it('validates sequential segments as VALID (happy path)', async () => {
    const { initSegment, segments } = await buildMerkleVodStream(3);
    const harness = buildHarness();

    await routeInit(harness, initSegment);
    for (let i = 0; i < segments.length; i++) await routeMedia(harness, segments[i], i);

    expect(harness.records).toHaveLength(3);
    harness.records.forEach((record, i) => {
      expect(record.status).toBe(SegmentStatus.VALID);
      expect(record.segmentNumber).toBe(i);
    });
  });

  it('flags a tampered segment as INVALID with bmffHash.mismatch', async () => {
    const { initSegment, segments } = await buildMerkleVodStream(3);
    const harness = buildHarness();
    const tampered = new Uint8Array(segments[1]);
    tampered[12] ^= 0xff; // flip a byte inside the mdat payload

    await routeInit(harness, initSegment);
    await routeMedia(harness, segments[0], 0);
    await routeMedia(harness, tampered, 1);

    expect(harness.records[0].status).toBe(SegmentStatus.VALID);
    expect(harness.records[1].status).toBe(SegmentStatus.INVALID);
    expect(harness.records[1].errorCodes).toContain(ValidationErrorCode.BMFF_HASH_MISMATCH);
  });

  it('flags a segment without an auxiliary box as INVALID with bmffHash.malformed', async () => {
    const { initSegment, segments } = await buildMerkleVodStream(3);
    const harness = buildHarness();
    // Strip the aux box: keep only moof + mdat (first two boxes)
    const view = new DataView(segments[0].buffer, segments[0].byteOffset);
    const moofSize = view.getUint32(0, false);
    const mdatSize = view.getUint32(moofSize, false);
    const withoutAux = segments[0].slice(0, moofSize + mdatSize);

    await routeInit(harness, initSegment);
    await routeMedia(harness, withoutAux, 0);

    expect(harness.records[0].status).toBe(SegmentStatus.INVALID);
    expect(harness.records[0].errorCodes).toContain(ValidationErrorCode.BMFF_HASH_MALFORMED);
  });

  it('flags a location gap without seek as WARNING (discontinuity)', async () => {
    const { initSegment, segments } = await buildMerkleVodStream(3);
    const harness = buildHarness();

    await routeInit(harness, initSegment);
    await routeMedia(harness, segments[0], 0);
    await routeMedia(harness, segments[2], 1); // segment 1 skipped without seek signal

    expect(harness.records[1].status).toBe(SegmentStatus.WARNING);
    expect(harness.records[1].errorCodes).toContain(ValidationErrorCode.ASSERTION_INVALID);
  });

  it('flags a replayed segment as WARNING (repeated location)', async () => {
    const { initSegment, segments } = await buildMerkleVodStream(3);
    const harness = buildHarness();

    await routeInit(harness, initSegment);
    await routeMedia(harness, segments[0], 0);
    await routeMedia(harness, segments[0], 1); // same segment re-injected

    expect(harness.records[1].status).toBe(SegmentStatus.WARNING);
    expect(harness.records[1].errorCodes).toContain(ValidationErrorCode.ASSERTION_INVALID);
  });

  it('validates multi-track segments (one aux box per track)', async () => {
    const { initSegment, segments } = await buildMerkleVodStream(3, [1, 2]);
    const harness = buildHarness();

    await routeInit(harness, initSegment);
    for (let i = 0; i < segments.length; i++) await routeMedia(harness, segments[i], i);

    expect(harness.initEvents[0].merkleMaps).toHaveLength(2);
    expect(harness.records).toHaveLength(3);
    harness.records.forEach((record) => expect(record.status).toBe(SegmentStatus.VALID));
  });

  it('rejects an init segment whose initHash does not match', async () => {
    const { segments } = await buildMerkleVodStream(3);
    // Build a second stream whose init is built from different media content:
    // its initHash matches its own ftyp+moov, so tamper the init's moov box.
    const { initSegment } = await buildMerkleVodStream(3);
    const tamperedInit = new Uint8Array(initSegment);
    tamperedInit[10] ^= 0xff; // inside ftyp payload → initHash no longer matches
    const harness = buildHarness();

    await routeInit(harness, tamperedInit);

    expect(harness.initEvents[0].errorCodes).toContain(ValidationErrorCode.BMFF_HASH_MISMATCH);
    expect(segments.length).toBeGreaterThan(0);
  });
});
