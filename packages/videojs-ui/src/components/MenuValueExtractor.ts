import type { ActiveManifest, PlaybackStatus } from '../types.js';
import { VALIDATION_STATUS_VALUES } from '../types.js';
import { extractActiveManifest } from '../ManifestNormalizer.js';

const CREATIVE_WORK_ASSERTION_LABEL = 'stds.schema-org.CreativeWork';
const CAWG_METADATA_ASSERTION_LABEL = 'cawg.metadata';
const BROADCAST_SERVICE_ASSERTION_LABEL = 'stds.schema-org.BroadcastService';

export const MenuItemKey = {
  DUAL_HEADER: 'DUAL_HEADER',
  SIG_ISSUER: 'SIG_ISSUER',
  SUBJECT_NAME: 'SUBJECT_NAME',
  CLAIM_GENERATOR: 'CLAIM_GENERATOR',
  CAWG_ISSUED_BY: 'CAWG_ISSUED_BY',
  CAWG_SUBJECT_NAME: 'CAWG_SUBJECT_NAME',
  ORGANIZATION: 'ORGANIZATION',
  STATION_ID: 'STATION_ID',
  PROGRAM: 'PROGRAM',
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
  // The dual header renders both column titles inline; the value is just a marker
  // string so the item always renders (renderMenuItemHtml handles the actual HTML).
  [MenuItemKey.DUAL_HEADER]: () => 'header',

  [MenuItemKey.SIG_ISSUER]: ({ manifest }) =>
    manifest?.certInfo?.issuerCN ?? manifest?.signatureInfo?.issuer ?? null,

  [MenuItemKey.SUBJECT_NAME]: ({ manifest }) => manifest?.certInfo?.subjectCN ?? null,

  [MenuItemKey.CAWG_ISSUED_BY]: ({ manifest }) => manifest?.cawgCertInfo?.issuerCN ?? null,
  [MenuItemKey.CAWG_SUBJECT_NAME]: ({ manifest }) => manifest?.cawgCertInfo?.subjectCN ?? null,

  [MenuItemKey.CLAIM_GENERATOR]: ({ manifest }) => manifest?.claimGenerator ?? null,

  [MenuItemKey.ORGANIZATION]: ({ manifest }) => {
    const cawgMeta = manifest?.assertions?.find((a) => a.label === CAWG_METADATA_ASSERTION_LABEL)
      ?.data as Record<string, unknown> | undefined;
    const publisher = cawgMeta?.['dc:publisher'];
    if (typeof publisher === 'string' && publisher) return publisher;
    const broadcastService = manifest?.assertions?.find(
      (a) => a.label === BROADCAST_SERVICE_ASSERTION_LABEL,
    )?.data as { broadcaster?: { name?: string } } | undefined;
    return broadcastService?.broadcaster?.name ?? null;
  },

  [MenuItemKey.STATION_ID]: ({ manifest }) => {
    const cawgMeta = manifest?.assertions?.find((a) => a.label === CAWG_METADATA_ASSERTION_LABEL)
      ?.data as Record<string, unknown> | undefined;
    const identifier = cawgMeta?.['dc:identifier'];
    if (typeof identifier === 'string' && identifier) return identifier;
    const broadcastService = manifest?.assertions?.find(
      (a) => a.label === BROADCAST_SERVICE_ASSERTION_LABEL,
    )?.data as { callSign?: string; broadcastChannelId?: string } | undefined;
    return broadcastService?.callSign ?? broadcastService?.broadcastChannelId ?? null;
  },

  [MenuItemKey.PROGRAM]: ({ manifest }) => {
    const cawgMeta = manifest?.assertions?.find((a) => a.label === CAWG_METADATA_ASSERTION_LABEL)
      ?.data as Record<string, unknown> | undefined;
    const title = cawgMeta?.['dc:title'];
    if (typeof title === 'string' && title) return title;
    if (Array.isArray(title) && title.length > 0 && typeof title[0] === 'string') return title[0];
    const cw = manifest?.assertions?.find((a) => a.label === CREATIVE_WORK_ASSERTION_LABEL)
      ?.data as { name?: string } | undefined;
    return cw?.name ?? null;
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
  [MenuItemKey.DUAL_HEADER]: () =>
    `<span class="subheader-left">Generator</span><span class="subheader-right">Customer</span>`,

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
  // Flex-column items stack label and value on separate rows. Combined with
  // white-space: pre-wrap, any leading whitespace before ${displayValue} renders
  // as a visible indent — keep the template tight.
  if (displayValue.length >= LONG_VALUE_CHARACTER_THRESHOLD) {
    return `<div class="itemName">${label}</div>${displayValue}`;
  }
  return `<span class="itemName">${label}</span>${displayValue}`;
}
