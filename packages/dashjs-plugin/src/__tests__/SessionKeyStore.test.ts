import { describe, it, expect } from 'vitest';
import { SessionKeyStore } from '../state/SessionKeyStore.js';
import type { ValidatedSessionKey } from '@svta/cml-c2pa';

function makeKey(kid: string): ValidatedSessionKey {
  return { kid } as unknown as ValidatedSessionKey;
}

describe('SessionKeyStore', () => {
  it('returns null for an unknown kid', () => {
    expect(new SessionKeyStore().get('unknown-kid')).toBeNull();
  });

  it('stores and retrieves a key by kid', () => {
    const store = new SessionKeyStore();
    const key = makeKey('kid-1');
    store.add(key);
    expect(store.get('kid-1')).toBe(key);
  });

  it('hasKeys returns false when the store is empty', () => {
    expect(new SessionKeyStore().hasKeys()).toBe(false);
  });

  it('hasKeys returns true after adding a key', () => {
    const store = new SessionKeyStore();
    store.add(makeKey('kid-1'));
    expect(store.hasKeys()).toBe(true);
  });

  it('getAll returns all stored keys', () => {
    const store = new SessionKeyStore();
    const k1 = makeKey('kid-1');
    const k2 = makeKey('kid-2');
    store.add(k1);
    store.add(k2);
    expect(store.getAll()).toEqual([k1, k2]);
  });

  it('clear removes all keys', () => {
    const store = new SessionKeyStore();
    store.add(makeKey('kid-1'));
    store.clear();
    expect(store.hasKeys()).toBe(false);
  });
});
