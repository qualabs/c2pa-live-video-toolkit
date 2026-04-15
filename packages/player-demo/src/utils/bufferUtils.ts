/**
 * Utilities for converting buffer-like objects (Uint8Array or index-keyed plain
 * objects) to a hex string representation suitable for display.
 */

function isBufferLike(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (obj instanceof Uint8Array) return true;
  const keys = Object.keys(obj as object);
  if (keys.length === 0) return false;
  return (
    keys.every((k) => /^\d+$/.test(k)) &&
    keys.every((k) => typeof (obj as Record<string, unknown>)[k] === 'number')
  );
}

export function bytesToHex(bytes: unknown): string {
  if (!bytes) return '';
  const arr =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(Object.values(bytes as Record<string, number>));
  return (
    '0x' +
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function convertBuffersToHex(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (isBufferLike(obj)) return bytesToHex(obj);
  if (Array.isArray(obj)) return obj.map(convertBuffersToHex);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = convertBuffersToHex((obj as Record<string, unknown>)[key]);
    }
    return result;
  }
  return obj;
}
