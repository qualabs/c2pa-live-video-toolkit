import type { ActiveManifest, ManifestAssertion, PlaybackStatus, SignatureInfo } from './types.js';

/**
 * Extracts the active C2PA manifest from a playback status, normalizing the shape.
 *
 * The raw manifest may arrive in several forms depending on the source (c2pa-rs raw
 * JSON uses snake_case; the JS validator emits camelCase; the payload may be a full
 * manifest store envelope or a flat active manifest). This function is the single
 * frontier where those variants are reconciled — downstream consumers always receive
 * the camelCase {@link ActiveManifest} shape.
 */
export function extractActiveManifest(status: PlaybackStatus): ActiveManifest | null {
  try {
    const manifest = status.details.video?.manifest;
    if (!isRecord(manifest)) return null;

    const store = isRecord(manifest.manifestStore) ? manifest.manifestStore : manifest;
    const rawActiveManifest = selectRawActiveManifest(store);
    return rawActiveManifest ? normalizeActiveManifest(rawActiveManifest) : null;
  } catch (error) {
    console.warn('[manifest] Failed to extract active manifest from playback status:', error);
    return null;
  }
}

function selectRawActiveManifest(store: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(store.activeManifest)) return store.activeManifest;

  const activeLabel = store.active_manifest;
  if (typeof activeLabel === 'string' && isRecord(store.manifests)) {
    const candidate = store.manifests[activeLabel];
    if (isRecord(candidate)) return candidate;
  }

  return hasActiveManifestFields(store) ? store : null;
}

function hasActiveManifestFields(obj: Record<string, unknown>): boolean {
  return (
    obj.signatureInfo != null ||
    obj.signature_info != null ||
    'claimGenerator' in obj ||
    'claim_generator' in obj
  );
}

function normalizeActiveManifest(raw: Record<string, unknown>): ActiveManifest {
  return {
    signatureInfo: (raw.signatureInfo ?? raw.signature_info) as SignatureInfo | undefined,
    claimGenerator: (raw.claimGenerator ?? raw.claim_generator) as string | undefined,
    assertions: raw.assertions as ManifestAssertion[] | undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
