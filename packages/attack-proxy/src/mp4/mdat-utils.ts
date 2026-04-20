import { readUint32BE, readUint64BE, findBox } from './mp4-utils.js';

// C2PA manifest store UUID per C2PA specification (d8fec3d6-1a96-4f32-a0f6-f3ecf96c10ea)
const C2PA_MANIFEST_UUID = new Uint8Array([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1a, 0x96, 0x4f, 0x32, 0xa0, 0xf6, 0xf3, 0xec, 0xf9, 0x6c, 0x10,
  0xea,
]);

// JUMBF UUID per ISO 19566-5 (used by some JUMBF-compliant tools)
const JUMBF_UUID = new Uint8Array([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4,
  0x81,
]);

const UUID_SIZE = 16;

// VSI scheme URI per C2PA Live Video specification
const VSI_SCHEME_URI = 'urn:c2pa:verifiable-segment-info';
const VSI_SCHEME_URI_BYTES = new TextEncoder().encode(VSI_SCHEME_URI);

function isC2paUuidBox(buffer: Uint8Array, offset: number): boolean {
  if (offset + 8 + UUID_SIZE > buffer.length) return false;
  const type = String.fromCharCode(
    buffer[offset + 4],
    buffer[offset + 5],
    buffer[offset + 6],
    buffer[offset + 7],
  );
  if (type !== 'uuid') return false;
  const uuid = buffer.subarray(offset + 8, offset + 8 + UUID_SIZE);
  return (
    C2PA_MANIFEST_UUID.every((b, i) => b === uuid[i]) || JUMBF_UUID.every((b, i) => b === uuid[i])
  );
}

function isVsiEmsgBox(buffer: Uint8Array, offset: number, boxSize: number): boolean {
  if (offset + 12 > buffer.length) {
    return false;
  }
  const type = String.fromCharCode(
    buffer[offset + 4],
    buffer[offset + 5],
    buffer[offset + 6],
    buffer[offset + 7],
  );
  if (type !== 'emsg') return false;

  // scheme_id_uri starts at offset 12 (after size+type+version+flags)
  if (buffer[offset + 8] !== 0) {
    return false;
  }
  const schemeStart = offset + 12;
  if (schemeStart + VSI_SCHEME_URI_BYTES.length >= offset + boxSize) {
    return false;
  }

  return VSI_SCHEME_URI_BYTES.every((b, i) => b === buffer[schemeStart + i]);
}

export function removeC2paManifestBox(segmentBytes: Uint8Array | Buffer): Uint8Array {
  const buffer = segmentBytes instanceof Uint8Array ? segmentBytes : new Uint8Array(segmentBytes);
  const parts: Uint8Array[] = [];
  let offset = 0;

  while (offset < buffer.length - 8) {
    let boxSize = readUint32BE(buffer, offset);
    if (boxSize === 1 && offset + 16 <= buffer.length) {
      boxSize = readUint64BE(buffer, offset + 8);
    }
    if (boxSize === 0 || boxSize > buffer.length || offset + boxSize > buffer.length) break;

    if (!isC2paUuidBox(buffer, offset) && !isVsiEmsgBox(buffer, offset, boxSize)) {
      parts.push(buffer.subarray(offset, offset + boxSize));
    }
    offset += boxSize;
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

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
    boxes.push({ type, offset, size: boxSize, data: buffer.subarray(offset, offset + boxSize) });
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
