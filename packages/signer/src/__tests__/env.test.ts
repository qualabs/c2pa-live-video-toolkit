import { describe, it, expect, afterEach } from 'vitest';
import { requireEnv } from '../utils/env.js';

describe('requireEnv', () => {
  const TEST_KEY = 'TEST_REQUIRE_ENV_KEY';

  afterEach(() => {
    delete process.env[TEST_KEY];
  });

  it('returns the value when the variable is set', () => {
    process.env[TEST_KEY] = 'hello';
    expect(requireEnv(TEST_KEY)).toBe('hello');
  });

  it('throws when the variable is not set', () => {
    expect(() => requireEnv(TEST_KEY)).toThrow(
      `Missing required environment variable: ${TEST_KEY}`,
    );
  });

  it('throws when the variable is an empty string', () => {
    process.env[TEST_KEY] = '';
    expect(() => requireEnv(TEST_KEY)).toThrow(
      `Missing required environment variable: ${TEST_KEY}`,
    );
  });
});
