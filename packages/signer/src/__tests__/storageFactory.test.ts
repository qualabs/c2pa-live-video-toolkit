import { describe, it, expect } from 'vitest';
import { createStorage } from '../services/storage/storageFactory.js';
import { LocalStorage } from '../services/storage/LocalStorage.js';

describe('createStorage', () => {
  it('returns a LocalStorage instance by default', () => {
    const storage = createStorage();
    expect(storage).toBeInstanceOf(LocalStorage);
  });

  it('returns LocalStorage when STORAGE_PROVIDER is "LOCAL"', () => {
    const prev = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = 'LOCAL';
    try {
      expect(createStorage()).toBeInstanceOf(LocalStorage);
    } finally {
      if (prev === undefined) delete process.env.STORAGE_PROVIDER;
      else process.env.STORAGE_PROVIDER = prev;
    }
  });

  it('throws for an unsupported storage provider', () => {
    const prev = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = 'AZURE';
    try {
      expect(() => createStorage()).toThrow('Unsupported storage provider: AZURE');
    } finally {
      if (prev === undefined) delete process.env.STORAGE_PROVIDER;
      else process.env.STORAGE_PROVIDER = prev;
    }
  });
});
