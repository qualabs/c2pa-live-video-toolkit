import { decode as cborDecode } from 'cbor-x/decode';
import { parseX509Names, type X509Names } from './x509.js';

// cbor-x decodes CBOR tags into instances of its `Tag` class. We can't import the
// class type from the browser-safe `cbor-x/decode` subpath, so duck-type it.
function isTag(v: unknown): v is { tag: number; value: unknown } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { tag?: unknown }).tag === 'number' &&
    'value' in (v as Record<string, unknown>)
  );
}

/**
 * Extracts the Subject/Issuer CNs from the CAWG identity assertion's leaf certificate.
 *
 * The `cawg.identity` assertion (CAWG Identity v1.1) carries its own COSE_Sign1 signature
 * under the `signature` field. The signing certificate chain lives in the COSE_Sign1
 * unprotected header at label 33 (x5chain, per RFC 9360). We CBOR-decode the COSE_Sign1
 * envelope, pull the first cert from the chain, and reuse the X.509 parser for the names.
 *
 * Best-effort: returns null on any unexpected shape so an unparseable assertion never
 * affects playback or the rest of the UI.
 */
export function extractCawgCertNames(cawgIdentityData: unknown): X509Names | null {
  try {
    const signature = (cawgIdentityData as { signature?: unknown })?.signature;
    if (!(signature instanceof Uint8Array)) return null;

    const raw = cborDecode(signature) as unknown;
    // COSE_Sign1 may be tag-18 wrapped or bare array
    const arr = isTag(raw) ? raw.value : raw;
    if (!Array.isArray(arr) || arr.length < 4) return null;

    const protectedHeader = arr[0];
    const unprotected = arr[1];
    if (!isMapLike(unprotected)) return null;

    const x5chain = getMapValue(unprotected, 33);
    if (x5chain == null) {
      // Some signers put x5chain in the protected header instead.
      if (protectedHeader instanceof Uint8Array) {
        try {
          const protectedDecoded = cborDecode(protectedHeader) as unknown;
          if (isMapLike(protectedDecoded)) {
            const px5chain = getMapValue(protectedDecoded, 33);
            if (px5chain != null) {
              const certBytes = Array.isArray(px5chain) ? px5chain[0] : px5chain;
              if (certBytes instanceof Uint8Array) return parseX509Names(certBytes);
            }
          }
        } catch {
          // fall through to return null
        }
      }
      return null;
    }

    const certBytes = Array.isArray(x5chain) ? x5chain[0] : x5chain;
    if (!(certBytes instanceof Uint8Array)) return null;
    return parseX509Names(certBytes);
  } catch {
    return null;
  }
}

function isMapLike(v: unknown): v is Map<unknown, unknown> | Record<string | number, unknown> {
  return v instanceof Map || (typeof v === 'object' && v !== null);
}

function getMapValue(
  m: Map<unknown, unknown> | Record<string | number, unknown>,
  key: number,
): unknown {
  if (m instanceof Map) return m.get(key) ?? m.get(String(key));
  return (m as Record<string | number, unknown>)[key];
}
