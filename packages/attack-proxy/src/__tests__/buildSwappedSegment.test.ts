import { describe, it, expect } from 'vitest';
import { buildSwappedSegment } from '../mp4/buildSwappedSegment.js';

/**
 * Builds a minimal ISOBMFF box: [4-byte size][4-byte type][payload]
 */
function makeBox(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

/**
 * Builds a minimal moof box containing:
 * - mfhd (sequence number)
 * - traf > tfhd (track id) + tfdt (decode time) + trun (sample count)
 */
function makeMoof(sequenceNumber: number, trackId: number, decodeTime: number): Buffer {
  // mfhd: version(1) + flags(3) + sequenceNumber(4)
  const mfhdPayload = Buffer.alloc(8);
  mfhdPayload.writeUInt32BE(0, 0); // version + flags
  mfhdPayload.writeUInt32BE(sequenceNumber, 4);
  const mfhd = makeBox('mfhd', mfhdPayload);

  // tfhd: version(1) + flags(3) + trackId(4)
  const tfhdPayload = Buffer.alloc(8);
  tfhdPayload.writeUInt32BE(0, 0); // version + flags
  tfhdPayload.writeUInt32BE(trackId, 4);
  const tfhd = makeBox('tfhd', tfhdPayload);

  // tfdt: version(1:0) + flags(3) + decodeTime(4)
  const tfdtPayload = Buffer.alloc(8);
  tfdtPayload.writeUInt8(0, 0); // version 0
  tfdtPayload.writeUInt32BE(decodeTime, 4);
  const tfdt = makeBox('tfdt', tfdtPayload);

  // trun: version(1) + flags(3) + sampleCount(4)
  const trunPayload = Buffer.alloc(8);
  trunPayload.writeUInt32BE(0, 0); // version + flags (no sample_size or duration flags)
  trunPayload.writeUInt32BE(1, 4); // 1 sample
  const trun = makeBox('trun', trunPayload);

  const traf = makeBox('traf', Buffer.concat([tfhd, tfdt, trun]));
  return makeBox('moof', Buffer.concat([mfhd, traf]));
}

function makeSegment(moof: Buffer, mdatPayload: Buffer = Buffer.from([0xaa, 0xbb])): Buffer {
  const mdat = makeBox('mdat', mdatPayload);
  return Buffer.concat([moof, mdat]);
}

describe('buildSwappedSegment', () => {
  it('returns a buffer when both original and swap have valid moof+mdat', () => {
    const original = makeSegment(makeMoof(1, 1, 1000));
    const swap = makeSegment(makeMoof(99, 1, 9999), Buffer.from([0xcc, 0xdd]));

    const result = buildSwappedSegment(original, swap, 1);

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null when the swap file has no moof', () => {
    const original = makeSegment(makeMoof(1, 1, 1000));
    const badSwap = makeBox('styp', Buffer.from([0x00])); // no moof/mdat

    expect(buildSwappedSegment(original, badSwap, 1)).toBeNull();
  });

  it('returns null when the original has no moof', () => {
    const badOriginal = makeBox('styp', Buffer.from([0x00]));
    const swap = makeSegment(makeMoof(99, 1, 9999));

    expect(buildSwappedSegment(badOriginal, swap, 1)).toBeNull();
  });

  it('returns null when track IDs differ', () => {
    const original = makeSegment(makeMoof(1, 1, 1000));
    const swap = makeSegment(makeMoof(99, 2, 9999)); // track 2 vs track 1

    expect(buildSwappedSegment(original, swap, 1)).toBeNull();
  });

  it('preserves the mdat content from the swap file', () => {
    const swapMdatPayload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const original = makeSegment(makeMoof(1, 1, 1000));
    const swap = makeSegment(makeMoof(99, 1, 9999), swapMdatPayload);

    const result = buildSwappedSegment(original, swap, 1);
    expect(result).not.toBeNull();

    // The mdat content from the swap should be present in the result
    expect(result!.includes(swapMdatPayload)).toBe(true);
  });
});
