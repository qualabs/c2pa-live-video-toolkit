import type { ValidatedSessionKey } from '@svta/cml-c2pa';

export class SessionKeyStore {
  private readonly keys = new Map<string, ValidatedSessionKey>();

  add(key: ValidatedSessionKey): void {
    this.keys.set(key.kid, key);
  }

  getAll(): ValidatedSessionKey[] {
    return Array.from(this.keys.values());
  }

  hasKeys(): boolean {
    return this.keys.size > 0;
  }

  clear(): void {
    this.keys.clear();
  }
}
