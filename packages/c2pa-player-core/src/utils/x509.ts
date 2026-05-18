/**
 * Minimal DER parser for extracting Subject CN and Issuer CN from a DER-encoded
 * X.509 certificate. Best-effort — never throws; returns nulls on malformed input.
 *
 * Walks just enough of the cert structure (RFC 5280) to reach the issuer and
 * subject Name fields, then scans their RDNSequence for the first attribute with
 * OID 2.5.4.3 (commonName).
 */

const TAG_INTEGER = 0x02;
const TAG_OID = 0x06;
const TAG_UTF8_STRING = 0x0c;
const TAG_PRINTABLE_STRING = 0x13;
const TAG_T61_STRING = 0x14;
const TAG_IA5_STRING = 0x16;
const TAG_BMP_STRING = 0x1e;
const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;
const TAG_CONTEXT_0 = 0xa0;

// commonName OID 2.5.4.3 → DER 0x55 0x04 0x03
const OID_CN = new Uint8Array([0x55, 0x04, 0x03]);

export type X509Names = {
  subjectCN: string | null;
  issuerCN: string | null;
};

type TLV = { tag: number; valueStart: number; end: number };

function readTLV(bytes: Uint8Array, offset: number): TLV | null {
  if (offset + 1 >= bytes.length) return null;
  const tag = bytes[offset];
  const lenByte = bytes[offset + 1];
  let valueStart: number;
  let valueLength: number;
  if (lenByte < 0x80) {
    valueLength = lenByte;
    valueStart = offset + 2;
  } else {
    const lenBytes = lenByte & 0x7f;
    if (lenBytes === 0 || lenBytes > 4 || offset + 2 + lenBytes > bytes.length) return null;
    valueLength = 0;
    for (let i = 0; i < lenBytes; i++) {
      valueLength = (valueLength << 8) | bytes[offset + 2 + i];
    }
    valueStart = offset + 2 + lenBytes;
  }
  const end = valueStart + valueLength;
  if (end > bytes.length) return null;
  return { tag, valueStart, end };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function decodeString(bytes: Uint8Array, tag: number, start: number, end: number): string | null {
  const slice = bytes.subarray(start, end);
  switch (tag) {
    case TAG_UTF8_STRING:
      return new TextDecoder('utf-8', { fatal: false }).decode(slice);
    case TAG_PRINTABLE_STRING:
    case TAG_IA5_STRING:
    case TAG_T61_STRING:
      return new TextDecoder('latin1', { fatal: false }).decode(slice);
    case TAG_BMP_STRING: {
      let s = '';
      for (let i = 0; i + 1 < slice.length; i += 2) {
        s += String.fromCharCode((slice[i] << 8) | slice[i + 1]);
      }
      return s;
    }
    default:
      return null;
  }
}

/**
 * Scans a Name (SEQUENCE OF SET OF SEQUENCE(OID, value)) for the first CN.
 */
function findCN(bytes: Uint8Array, start: number, end: number): string | null {
  let offset = start;
  while (offset < end) {
    const rdn = readTLV(bytes, offset);
    if (!rdn || rdn.tag !== TAG_SET) return null;
    let attrOffset = rdn.valueStart;
    while (attrOffset < rdn.end) {
      const attr = readTLV(bytes, attrOffset);
      if (!attr || attr.tag !== TAG_SEQUENCE) return null;
      const oid = readTLV(bytes, attr.valueStart);
      if (oid && oid.tag === TAG_OID) {
        const oidBytes = bytes.subarray(oid.valueStart, oid.end);
        if (bytesEqual(oidBytes, OID_CN)) {
          const value = readTLV(bytes, oid.end);
          if (value) return decodeString(bytes, value.tag, value.valueStart, value.end);
        }
      }
      attrOffset = attr.end;
    }
    offset = rdn.end;
  }
  return null;
}

export function parseX509Names(bytes: Uint8Array): X509Names {
  try {
    const cert = readTLV(bytes, 0);
    if (!cert || cert.tag !== TAG_SEQUENCE) return { subjectCN: null, issuerCN: null };

    const tbs = readTLV(bytes, cert.valueStart);
    if (!tbs || tbs.tag !== TAG_SEQUENCE) return { subjectCN: null, issuerCN: null };

    let offset = tbs.valueStart;

    // Optional [0] EXPLICIT version
    const first = readTLV(bytes, offset);
    if (!first) return { subjectCN: null, issuerCN: null };
    if (first.tag === TAG_CONTEXT_0) offset = first.end;

    // serialNumber INTEGER
    const serial = readTLV(bytes, offset);
    if (!serial || serial.tag !== TAG_INTEGER) return { subjectCN: null, issuerCN: null };
    offset = serial.end;

    // signature AlgorithmIdentifier SEQUENCE
    const sigAlg = readTLV(bytes, offset);
    if (!sigAlg || sigAlg.tag !== TAG_SEQUENCE) return { subjectCN: null, issuerCN: null };
    offset = sigAlg.end;

    // issuer Name SEQUENCE
    const issuer = readTLV(bytes, offset);
    if (!issuer || issuer.tag !== TAG_SEQUENCE) return { subjectCN: null, issuerCN: null };
    const issuerCN = findCN(bytes, issuer.valueStart, issuer.end);
    offset = issuer.end;

    // validity SEQUENCE
    const validity = readTLV(bytes, offset);
    if (!validity || validity.tag !== TAG_SEQUENCE) return { subjectCN: null, issuerCN };
    offset = validity.end;

    // subject Name SEQUENCE
    const subject = readTLV(bytes, offset);
    if (!subject || subject.tag !== TAG_SEQUENCE) return { subjectCN: null, issuerCN };
    const subjectCN = findCN(bytes, subject.valueStart, subject.end);

    return { subjectCN, issuerCN };
  } catch {
    return { subjectCN: null, issuerCN: null };
  }
}
