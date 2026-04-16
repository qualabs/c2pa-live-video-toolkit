import { describe, it, expect } from 'vitest';
import { getCertPath, getPrivateKeyPath, getCertHash } from '../credentials.js';

describe('credential getters (before initialization)', () => {
  // These test the guard clauses we added.
  // The module-level variables are unset in a fresh import context,
  // so calling the getters should throw.

  it('getCertPath throws when credentials are not initialized', () => {
    expect(() => getCertPath()).toThrow('Credentials not initialized');
  });

  it('getPrivateKeyPath throws when credentials are not initialized', () => {
    expect(() => getPrivateKeyPath()).toThrow('Credentials not initialized');
  });

  it('getCertHash throws when credentials are not initialized', () => {
    expect(() => getCertHash()).toThrow('Credentials not initialized');
  });
});
