import { describe, it, expect } from 'vitest';
import { providerInfoFromSocialUrl } from './SocialProviders.js';

describe('providerInfoFromSocialUrl', () => {
  it('returns Nikon for a URL containing "nikon"', () => {
    expect(providerInfoFromSocialUrl('https://www.nikon.com/profile/123')).toEqual({
      name: 'Nikon',
    });
  });

  it('returns YouTube for a youtube.com URL', () => {
    expect(providerInfoFromSocialUrl('https://www.youtube.com/watch?v=abc')).toEqual({
      name: 'YouTube',
    });
  });

  it('returns Instagram for an instagram.com URL', () => {
    expect(providerInfoFromSocialUrl('https://instagram.com/user')).toEqual({ name: 'Instagram' });
  });

  it('returns Facebook for a facebook.com URL', () => {
    expect(providerInfoFromSocialUrl('https://www.facebook.com/post/1')).toEqual({
      name: 'Facebook',
    });
  });

  it('returns LinkedIn for a linkedin.com URL', () => {
    expect(providerInfoFromSocialUrl('https://linkedin.com/in/user')).toEqual({ name: 'LinkedIn' });
  });

  it('returns Adobe Express before generic Adobe when URL contains "adobe express"', () => {
    expect(providerInfoFromSocialUrl('adobe express app')).toEqual({ name: 'Adobe Express' });
  });

  it('returns Adobe Firefly for a URL containing "adobe firefly"', () => {
    expect(providerInfoFromSocialUrl('adobe firefly generator')).toEqual({ name: 'Adobe Firefly' });
  });

  it('returns generic Adobe when URL contains "adobe" but no specific product', () => {
    expect(providerInfoFromSocialUrl('https://adobe.com/products')).toEqual({ name: 'Adobe' });
  });

  it('returns Leica for a URL containing "leica"', () => {
    expect(providerInfoFromSocialUrl('https://leica-camera.com')).toEqual({ name: 'Leica' });
  });

  it('returns Leica for a URL containing "M11"', () => {
    expect(providerInfoFromSocialUrl('Leica M11 camera')).toEqual({ name: 'Leica' });
  });

  it('returns the raw URL as name when no provider matches', () => {
    const url = 'https://unknown-provider.example.com/profile';
    expect(providerInfoFromSocialUrl(url)).toEqual({ name: url });
  });

  it('matching is case-insensitive', () => {
    expect(providerInfoFromSocialUrl('HTTPS://WWW.TWITTER.COM/user')).toEqual({ name: 'Twitter' });
  });
});
