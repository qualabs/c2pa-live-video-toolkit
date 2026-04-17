import type { ActiveManifest, PlaybackStatus } from '../types.js';
import { VALIDATION_STATUS_VALUES } from '../types.js';
import { extractActiveManifest } from '../ManifestNormalizer.js';

const CREATIVE_WORK_ASSERTION_LABEL = 'stds.schema-org.CreativeWork';

export const MenuItemKey = {
  SIG_ISSUER: 'SIG_ISSUER',
  DATE: 'DATE',
  CLAIM_GENERATOR: 'CLAIM_GENERATOR',
  NAME: 'NAME',
  VALIDATION_STATUS: 'VALIDATION_STATUS',
  ALERT: 'ALERT',
} as const;

export type MenuItemKey = (typeof MenuItemKey)[keyof typeof MenuItemKey];

// Values longer than this are truncated in the menu to prevent layout overflow
const LONG_VALUE_CHARACTER_THRESHOLD = 23;

type ExtractContext = {
  manifest: ActiveManifest | null;
  status: PlaybackStatus;
  compromisedRegions: string[];
};

type ValueExtractor = (ctx: ExtractContext) => string | string[] | null;

const VALUE_EXTRACTORS: Record<MenuItemKey, ValueExtractor> = {
  [MenuItemKey.SIG_ISSUER]: ({ manifest }) => manifest?.signatureInfo?.issuer ?? null,

  [MenuItemKey.DATE]: ({ manifest }) => {
    const timeValue = manifest?.signatureInfo?.time ?? manifest?.signatureInfo?.certNotBefore;
    if (!timeValue) return null;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(new Date(timeValue));
  },

  [MenuItemKey.CLAIM_GENERATOR]: ({ manifest }) => manifest?.claimGenerator ?? null,

  [MenuItemKey.NAME]: ({ manifest }) => {
    const cw = manifest?.assertions?.find((a) => a.label === CREATIVE_WORK_ASSERTION_LABEL);
    const authors = cw?.data?.author as Array<{ name?: string }> | undefined;
    return authors?.[0]?.name ?? null;
  },

  [MenuItemKey.VALIDATION_STATUS]: ({ status }) => {
    if (status.verified === true) return VALIDATION_STATUS_VALUES.PASSED;
    if (status.verified === false) return VALIDATION_STATUS_VALUES.FAILED;
    return VALIDATION_STATUS_VALUES.UNKNOWN;
  },

  [MenuItemKey.ALERT]: ({ compromisedRegions }) => {
    if (compromisedRegions.length === 0) return null;
    return `The segment between ${compromisedRegions.join(', ')} may have been tampered with`;
  },
};

export function extractMenuValue(
  key: MenuItemKey,
  status: PlaybackStatus,
  compromisedRegions: string[],
): string | string[] | null {
  const manifest = extractActiveManifest(status);
  const extractor = VALUE_EXTRACTORS[key];
  return extractor({ manifest, status, compromisedRegions });
}

type HtmlRenderer = (label: string, value: string | string[]) => string | null;

const HTML_RENDERERS: Partial<Record<MenuItemKey, HtmlRenderer>> = {
  [MenuItemKey.ALERT]: (_label, value) => {
    if (typeof value !== 'string') return null;
    return `<div class="alert-div"><img class="alert-icon" alt="alert"><div class="alert-content-scrollable">${value}</div></div>`;
  },

  [MenuItemKey.VALIDATION_STATUS]: (label, value) => {
    if (value === VALIDATION_STATUS_VALUES.FAILED) {
      return `<span class="itemName nextLine">${label}</span>`;
    }
    return null;
  },
};

export function renderMenuItemHtml(
  key: MenuItemKey,
  label: string,
  value: string | string[],
): string {
  const customRenderer = HTML_RENDERERS[key];
  if (customRenderer) {
    const result = customRenderer(label, value);
    if (result !== null) return result;
  }

  const displayValue = Array.isArray(value) ? value.join(', ') : value;
  if (displayValue.length >= LONG_VALUE_CHARACTER_THRESHOLD) {
    return `<div class="itemName">${label}</div>${displayValue}`;
  }

  return `<span class="itemName">${label}</span> ${displayValue}`;
}
