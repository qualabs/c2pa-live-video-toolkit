import { readUint32BE, readUint64BE, findBox } from './mp4-utils.js';

export interface MoofMdatExtraction {
  moof: Uint8Array;
  mdat: Uint8Array;
  moofOffset: number;
  mdatOffset: number;
}

export function extractMoofMdat(segmentBytes: Uint8Array | Buffer): MoofMdatExtraction | null {
  const buffer = segmentBytes instanceof Uint8Array ? segmentBytes : new Uint8Array(segmentBytes);
  const moof = findBox(buffer, 'moof');
  const mdat = findBox(buffer, 'mdat');

  if (!moof || !mdat) return null;

  return {
    moof: moof.fullBox,
    mdat: mdat.fullBox,
    moofOffset: moof.offset,
    mdatOffset: mdat.offset,
  };
}

export function replaceMoofMdat(
  segmentBytes: Uint8Array | Buffer,
  newMoof: Uint8Array | Buffer,
  newMdat: Uint8Array | Buffer,
): Uint8Array {
  const buffer = segmentBytes instanceof Uint8Array ? segmentBytes : new Uint8Array(segmentBytes);
  const boxes: { type: string; offset: number; size: number; data: Uint8Array }[] = [];
  let offset = 0;

  while (offset < buffer.length - 8) {
    let boxSize = readUint32BE(buffer, offset);
    if (boxSize === 1 && offset + 16 <= buffer.length) {
      boxSize = readUint64BE(buffer, offset + 8);
    }
    if (boxSize === 0 || boxSize > buffer.length || offset + boxSize > buffer.length) break;

    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );
    boxes.push({ type, offset, size: boxSize, data: buffer.slice(offset, offset + boxSize) });
    offset += boxSize;
  }

  const newMoofArray = newMoof instanceof Uint8Array ? newMoof : new Uint8Array(newMoof);
  const newMdatArray = newMdat instanceof Uint8Array ? newMdat : new Uint8Array(newMdat);

  const parts = boxes.map((box) =>
    box.type === 'moof' ? newMoofArray : box.type === 'mdat' ? newMdatArray : box.data,
  );

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }

  return result;
}
