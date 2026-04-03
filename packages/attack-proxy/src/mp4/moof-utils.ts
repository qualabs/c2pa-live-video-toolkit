import { readUint32BE, writeUint32BE, readUint64BE, writeUint64BE, findChildBox } from './mp4-utils.js';

const SAMPLE_SIZE_PRESENT = 0x000200;
const SAMPLE_DURATION_PRESENT = 0x000100;

export function setTrunSampleCount(moofData: Uint8Array | Buffer, count: number): Uint8Array {
  const buf = new Uint8Array(moofData instanceof Uint8Array ? moofData : new Uint8Array(moofData));
  const traf = findChildBox(buf, 'traf', 8);
  if (!traf) return buf;
  const trun = findChildBox(traf.data, 'trun', 8);
  if (!trun) return buf;
  writeUint32BE(buf, traf.offset + trun.offset + 12, count >>> 0);
  return buf;
}

export function getBaseMediaDecodeTimeFromMoof(moofData: Uint8Array | Buffer): number | null {
  const traf = findChildBox(moofData, 'traf');
  if (!traf) return null;

  const tfdt = findChildBox(traf.data, 'tfdt');
  if (!tfdt) return null;

  const version = tfdt.data[8];
  return version === 0 ? readUint32BE(tfdt.data, 12) : readUint64BE(tfdt.data, 12);
}

export function setMfhdSequenceNumber(moofData: Uint8Array | Buffer, newSequenceNumber: number): Uint8Array {
  const result = new Uint8Array(moofData instanceof Uint8Array ? moofData : new Uint8Array(moofData));

  let offset = 8;
  while (offset < result.length - 8) {
    const boxSize = readUint32BE(result, offset);
    if (boxSize === 0 || boxSize > result.length - offset) break;

    const type = String.fromCharCode(result[offset + 4], result[offset + 5], result[offset + 6], result[offset + 7]);

    if (type === 'mfhd') {
      writeUint32BE(result, offset + 12, newSequenceNumber);
      break;
    }
    offset += boxSize;
  }

  return result;
}

export function setBaseMediaDecodeTimeInMoof(moofData: Uint8Array | Buffer, newTimestamp: number): Uint8Array {
  const result = new Uint8Array(moofData instanceof Uint8Array ? moofData : new Uint8Array(moofData));

  const traf = findChildBox(result, 'traf');
  if (!traf) return result;

  let tfdtOffset = traf.offset + 8;

  while (tfdtOffset < traf.offset + traf.size - 8) {
    const boxSize = readUint32BE(result, tfdtOffset);
    if (boxSize === 0 || boxSize > traf.size) break;

    const type = String.fromCharCode(result[tfdtOffset + 4], result[tfdtOffset + 5], result[tfdtOffset + 6], result[tfdtOffset + 7]);

    if (type === 'tfdt') {
      const version = result[tfdtOffset + 8];
      if (version === 0) {
        writeUint32BE(result, tfdtOffset + 12, newTimestamp & 0xffffffff);
      } else {
        writeUint64BE(result, tfdtOffset + 12, newTimestamp);
      }
      break;
    }
    tfdtOffset += boxSize;
  }

  return result;
}

export function getTrackIdFromMoof(moofData: Uint8Array | Buffer): number | null {
  const traf = findChildBox(moofData, 'traf');
  if (!traf) return null;

  const tfhd = findChildBox(traf.data, 'tfhd', 8);
  if (!tfhd) return null;

  return readUint32BE(tfhd.data, 12);
}

export function setTrackIdInMoof(moofData: Uint8Array | Buffer, newTrackId: number): Uint8Array {
  const result = new Uint8Array(moofData instanceof Uint8Array ? moofData : new Uint8Array(moofData));

  const traf = findChildBox(result, 'traf');
  if (!traf) return result;

  const tfhd = findChildBox(traf.data, 'tfhd', 8);
  if (!tfhd) return result;

  writeUint32BE(result, traf.offset + tfhd.offset + 12, newTrackId);
  return result;
}

export function getTrunSampleCount(moofData: Uint8Array | Buffer): number | null {
  const traf = findChildBox(moofData, 'traf');
  if (!traf) return null;

  const trun = findChildBox(traf.data, 'trun', 8);
  if (!trun) return null;

  return readUint32BE(trun.data, 12);
}

export function getTrunSampleSizes(moofData: Uint8Array | Buffer): number[] | null {
  const traf = findChildBox(moofData, 'traf');
  if (!traf) return null;

  const trun = findChildBox(traf.data, 'trun', 8);
  if (!trun) return null;

  const flags = (trun.data[9] << 16) | (trun.data[10] << 8) | trun.data[11];
  if (!(flags & SAMPLE_SIZE_PRESENT)) return null;

  const sampleCount = readUint32BE(trun.data, 12);
  const sizes: number[] = [];
  let offset = 16;

  if (flags & SAMPLE_DURATION_PRESENT) {
    offset += sampleCount * 4;
  }

  for (let i = 0; i < sampleCount; i++) {
    sizes.push(readUint32BE(trun.data, offset));
    offset += 4;
  }

  return sizes;
}

export function rewriteTrunSampleSizes(moofData: Uint8Array | Buffer, newSizes: number[]): Uint8Array {
  const buf = new Uint8Array(moofData instanceof Uint8Array ? moofData : new Uint8Array(moofData));
  const traf = findChildBox(buf, 'traf', 8);
  if (!traf) return buf;

  const trun = findChildBox(traf.data, 'trun', 8);
  if (!trun) return buf;

  const flags = (trun.data[9] << 16) | (trun.data[10] << 8) | trun.data[11];
  if (!(flags & SAMPLE_SIZE_PRESENT)) return buf;

  let offset = traf.offset + trun.offset + 16;

  if (flags & SAMPLE_DURATION_PRESENT) {
    const sampleCount = readUint32BE(trun.data, 12);
    offset += sampleCount * 4;
  }

  const sampleCount = readUint32BE(trun.data, 12);
  for (let i = 0; i < newSizes.length && i < sampleCount; i++) {
    writeUint32BE(buf, offset, newSizes[i]);
    offset += 4;
  }

  return buf;
}

export function getTrunSampleDurations(moofData: Uint8Array | Buffer): number[] | null {
  const traf = findChildBox(moofData, 'traf', 8);
  if (!traf) return null;

  const trun = findChildBox(traf.data, 'trun', 8);
  if (!trun) return null;

  const flags = (trun.data[9] << 16) | (trun.data[10] << 8) | trun.data[11];
  if (!(flags & SAMPLE_DURATION_PRESENT)) return null;

  const sampleCount = readUint32BE(trun.data, 12);
  let offset = 16;
  const durations: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    durations.push(readUint32BE(trun.data, offset));
    offset += 4;
    if (flags & SAMPLE_SIZE_PRESENT) offset += 4;
  }

  return durations;
}

export function rewriteTrunSampleDurations(moofData: Uint8Array | Buffer, newDurations: number[]): Uint8Array {
  const buf = new Uint8Array(moofData instanceof Uint8Array ? moofData : new Uint8Array(moofData));
  const traf = findChildBox(buf, 'traf', 8);
  if (!traf) return buf;

  const trun = findChildBox(traf.data, 'trun', 8);
  if (!trun) return buf;

  const flags = (trun.data[9] << 16) | (trun.data[10] << 8) | trun.data[11];
  if (!(flags & SAMPLE_DURATION_PRESENT)) return buf;

  let offset = traf.offset + trun.offset + 16;
  const sampleCount = readUint32BE(trun.data, 12);

  for (let i = 0; i < newDurations.length && i < sampleCount; i++) {
    writeUint32BE(buf, offset, newDurations[i]);
    offset += 4;
    if (flags & SAMPLE_SIZE_PRESENT) offset += 4;
  }

  return buf;
}
