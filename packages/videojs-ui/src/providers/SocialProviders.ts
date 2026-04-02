type ProviderMatcher = {
  pattern: RegExp;
  name: string;
};

type ProviderInfo = {
  name: string;
};

const SOCIAL_PROVIDERS: ProviderMatcher[] = [
  { pattern: /nikon/i, name: 'Nikon' },
  { pattern: /photoshop/i, name: 'Photoshop' },
  { pattern: /adobe\sexpress/i, name: 'Adobe Express' },
  { pattern: /adobe\sfirefly/i, name: 'Adobe Firefly' },
  { pattern: /adobe\sstock/i, name: 'Adobe Stock' },
  { pattern: /adobe/i, name: 'Adobe' },
  { pattern: /behance\.net/i, name: 'Behance' },
  { pattern: /net\.s2stagehance\.com/i, name: 'Behance (staging)' },
  { pattern: /facebook\.com/i, name: 'Facebook' },
  { pattern: /instagram\.com/i, name: 'Instagram' },
  { pattern: /linkedin\.com/i, name: 'LinkedIn' },
  { pattern: /truepic/i, name: 'Truepic' },
  { pattern: /twitter\.com/i, name: 'Twitter' },
  { pattern: /pinterest\.com/i, name: 'Pinterest' },
  { pattern: /vimeo\.com/i, name: 'Vimeo' },
  { pattern: /youtube\.com/i, name: 'YouTube' },
  { pattern: /leica/i, name: 'Leica' },
  { pattern: /M11/i, name: 'Leica' },
  { pattern: /lightroom/i, name: 'Adobe Lightroom' },
];

/**
 * Returns the human-readable provider name for a given social/website URL.
 * Falls back to the raw URL if no provider matches.
 */
export function providerInfoFromSocialUrl(url: string): ProviderInfo {
  const match = SOCIAL_PROVIDERS.find(({ pattern }) => pattern.test(url));
  return { name: match?.name ?? url };
}
