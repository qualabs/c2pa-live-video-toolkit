import { encode } from 'cbor-x';

const TEXT_ENCODER = new TextEncoder();

/** C2PA auxiliary uuid box extended type (§A.5.4) */
const MERKLE_AUX_UUID: readonly number[] = [
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0d, 0x11, 0xec, 0x81, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

// JUMBF UUID per ISO 19566-5 (matched by CML's readC2paManifest)
const JUMBF_UUID: readonly number[] = [
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
];

export const MERKLE_EXCLUSIONS = [{ xpath: '/uuid' }];

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function buildBox(type: string, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const size = 8 + payload.length;
  const box = new Uint8Array(size);
  new DataView(box.buffer).setUint32(0, size, false);
  for (let i = 0; i < 4; i++) box[4 + i] = type.charCodeAt(i);
  box.set(payload, 8);
  return box;
}

function buildUuidBox(usertype: readonly number[], payload: Uint8Array): Uint8Array {
  return buildBox('uuid', concatBytes(new Uint8Array(usertype), payload));
}

// ── Merkle tree (balanced binary, §15.12.2) ─────────────────────────

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
}

// Each non-excluded top-level box is prefixed with its 8-byte file offset (§18.6.2).
async function offsetPrefixedHash(boxes: readonly Uint8Array[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (const box of boxes) {
    const prefix = new Uint8Array(8);
    new DataView(prefix.buffer).setBigUint64(0, BigInt(offset), false);
    parts.push(prefix, box);
    offset += box.length;
  }
  return sha256(concatBytes(...parts));
}

type TreeLevels = (Uint8Array | null)[][];

async function buildTreeLevels(leaves: readonly Uint8Array[]): Promise<TreeLevels> {
  const depth = leaves.length > 1 ? Math.ceil(Math.log2(leaves.length)) : 0;
  const level: (Uint8Array | null)[] = [...leaves];
  while (level.length < 2 ** depth) level.push(null);

  const levels: TreeLevels = [level];
  let current = level;
  while (current.length > 1) {
    const next: (Uint8Array | null)[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? null;
      next.push(left && right ? await sha256(concatBytes(left, right)) : (left ?? right));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

function buildProofPath(
  levels: TreeLevels,
  leafIndex: number,
  manifestRowLevel: number,
): (Uint8Array | null)[] {
  const path: (Uint8Array | null)[] = [];
  let index = leafIndex;
  for (let level = 0; level < manifestRowLevel; level++) {
    const row = levels[level];
    path.push((index % 2 === 0 ? row[index + 1] : row[index - 1]) ?? null);
    index = Math.floor(index / 2);
  }
  return path;
}

// ── Segment / init builders ─────────────────────────────────────────

function buildMerkleAuxBox(
  uniqueId: number,
  localId: number,
  location: number,
  hashes: readonly (Uint8Array | null)[],
): Uint8Array {
  const map = new Map<number, unknown>([
    [1, uniqueId],
    [2, localId],
    [3, location],
    [4, hashes],
  ]);
  const payload = encode({ box_purpose: 'merkle', data: encode(map) as Uint8Array }) as Uint8Array;
  return buildUuidBox(MERKLE_AUX_UUID, payload);
}

function buildJumd(label: string): Uint8Array {
  const labelBytes = TEXT_ENCODER.encode(label);
  const data = new Uint8Array(16 + 1 + labelBytes.length + 1);
  data[16] = 0x03; // toggles: requestable + label present
  data.set(labelBytes, 17);
  return buildBox('jumd', data);
}

function buildJumb(label: string, ...content: readonly Uint8Array[]): Uint8Array {
  return buildBox('jumb', concatBytes(buildJumd(label), ...content));
}

function buildInitSegment(assertionData: Record<string, unknown>): Uint8Array {
  const bmffAssertion = buildJumb(
    'c2pa.hash.bmff.v3',
    buildBox('cbor', encode(assertionData) as Uint8Array),
  );
  const assertionStore = buildJumb('c2pa.assertions', bmffAssertion);
  const claimData = { instanceID: 'urn:uuid:merkle-vod-test', created_assertions: [] };
  const claim = buildJumb('c2pa.claim', buildBox('cbor', encode(claimData) as Uint8Array));
  const manifestJumb = buildJumb('urn:uuid:merkle-vod-test', claim, assertionStore);
  const store = buildJumb('c2pa', manifestJumb);

  const purpose = TEXT_ENCODER.encode('manifest');
  const prefix = new Uint8Array(4 + purpose.length + 1 + 8); // fullbox header + purpose\0 + offset
  prefix.set(purpose, 4);
  const uuidBox = buildUuidBox(JUMBF_UUID, concatBytes(prefix, store));

  return concatBytes(buildBox('ftyp', TEXT_ENCODER.encode('isom')), buildBox('moov'), uuidBox);
}

// ── Public fixture entry point ──────────────────────────────────────

export type MerkleVodStream = {
  initSegment: Uint8Array;
  segments: Uint8Array[];
};

// contentSeed varies the payload: distinct trees, same track ids and count.
export async function buildMerkleVodStream(
  segmentCount: number,
  localIds: readonly number[] = [1],
  contentSeed = 0,
): Promise<MerkleVodStream> {
  const uniqueId = 1;
  const contentBoxes = Array.from({ length: segmentCount }, (_, i) => [
    buildBox('moof'),
    buildBox('mdat', new Uint8Array([contentSeed + i, contentSeed + i + 1, contentSeed + i + 2])),
  ]);
  const contents = contentBoxes.map((boxes) => concatBytes(...boxes));
  const leafHashes = await Promise.all(contentBoxes.map((boxes) => offsetPrefixedHash(boxes)));
  const levels = await buildTreeLevels(leafHashes);
  const depth = levels.length - 1;
  const manifestRowNodes = levels[depth].filter((n): n is Uint8Array => n !== null);

  const initHash = await offsetPrefixedHash([
    buildBox('ftyp', TEXT_ENCODER.encode('isom')),
    buildBox('moov'),
  ]);

  const initSegment = buildInitSegment({
    alg: 'sha256',
    exclusions: MERKLE_EXCLUSIONS,
    merkle: localIds.map((localId) => ({
      uniqueId,
      localId,
      count: segmentCount,
      alg: 'sha256',
      initHash,
      hashes: manifestRowNodes,
    })),
  });

  const segments = contents.map((content, i) =>
    concatBytes(
      content,
      ...localIds.map((localId) =>
        buildMerkleAuxBox(uniqueId, localId, i, buildProofPath(levels, i, depth)),
      ),
    ),
  );

  return { initSegment, segments };
}
