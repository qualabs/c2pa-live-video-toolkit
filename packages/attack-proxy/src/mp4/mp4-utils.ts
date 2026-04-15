export interface BoxLocation {
  offset: number;
  size: number;
  headerSize: number;
  fullBox: Uint8Array;
}

export interface ChildBoxLocation {
  offset: number;
  size: number;
  data: Uint8Array;
}

export function readUint32BE(buffer: Uint8Array, offset: number): number {
  return (
    ((buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]) >>>
    0
  );
}

export function writeUint32BE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = (value >>> 24) & 0xff;
  buffer[offset + 1] = (value >>> 16) & 0xff;
  buffer[offset + 2] = (value >>> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}

export function readUint64BE(buffer: Uint8Array, offset: number): number {
  return readUint32BE(buffer, offset) * 0x100000000 + readUint32BE(buffer, offset + 4);
}

export function writeUint64BE(buffer: Uint8Array, offset: number, value: number): void {
  writeUint32BE(buffer, offset, Math.floor(value / 0x100000000));
  writeUint32BE(buffer, offset + 4, value % 0x100000000);
}

export function findBox(segmentBytes: Uint8Array | Buffer, boxType: string): BoxLocation | null {
  const buffer = segmentBytes instanceof Uint8Array ? segmentBytes : new Uint8Array(segmentBytes);
  let offset = 0;

  while (offset < buffer.length - 8) {
    let boxSize = readUint32BE(buffer, offset);
    let headerSize = 8;

    if (boxSize === 1 && offset + 16 <= buffer.length) {
      boxSize = readUint64BE(buffer, offset + 8);
      headerSize = 16;
    }

    if (boxSize === 0 || boxSize > buffer.length || offset + boxSize > buffer.length) break;

    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );

    if (type === boxType) {
      return { offset, size: boxSize, headerSize, fullBox: buffer.slice(offset, offset + boxSize) };
    }
    offset += boxSize;
  }
  return null;
}

export function findChildBox(
  parentBoxData: Uint8Array | Buffer,
  childType: string,
  parentHeaderSize = 8,
): ChildBoxLocation | null {
  const buffer =
    parentBoxData instanceof Uint8Array ? parentBoxData : new Uint8Array(parentBoxData);
  let offset = parentHeaderSize;

  while (offset < buffer.length - 8) {
    const boxSize = readUint32BE(buffer, offset);
    if (boxSize === 0 || boxSize > buffer.length - offset) break;

    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );

    if (type === childType) {
      return { offset, size: boxSize, data: buffer.slice(offset, offset + boxSize) };
    }
    offset += boxSize;
  }
  return null;
}
