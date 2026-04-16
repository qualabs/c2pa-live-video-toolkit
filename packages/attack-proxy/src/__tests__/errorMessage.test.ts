import { describe, it, expect } from 'vitest';
import { errorMessage } from '../utils/logger.js';

describe('errorMessage', () => {
  it('returns the message from an Error instance', () => {
    expect(errorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('converts a string to itself', () => {
    expect(errorMessage('raw string')).toBe('raw string');
  });

  it('converts a number to string', () => {
    expect(errorMessage(42)).toBe('42');
  });

  it('converts null to string', () => {
    expect(errorMessage(null)).toBe('null');
  });

  it('converts undefined to string', () => {
    expect(errorMessage(undefined)).toBe('undefined');
  });
});
