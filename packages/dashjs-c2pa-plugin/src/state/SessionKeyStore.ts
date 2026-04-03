import type { ValidatedSessionKey } from '@svta/cml-c2pa';

export class SessionKeyStore {
  private readonly keys = new Map<string, ValidatedSessionKey>();
  private manifestId: Uint8Array | null = null;

  add(key: ValidatedSessionKey): void {
    this.keys.set(key.kid, key);
  }

  get(kid: string): ValidatedSessionKey | null {
    return this.keys.get(kid) ?? null;
  }

  getAll(): ValidatedSessionKey[] {
    return Array.from(this.keys.values());
  }

  hasKeys(): boolean {
    return this.keys.size > 0;
  }

  setManifestId(id: Uint8Array): void {
    this.manifestId = id;
  }

  getManifestId(): Uint8Array | null {
    return this.manifestId;
  }

  clear(): void {
    this.keys.clear();
    this.manifestId = null;
  }
}
