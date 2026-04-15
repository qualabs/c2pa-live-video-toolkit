import videojs from 'video.js';
import type {
  VideoJsPlayer,
  VjsComponent,
  PlaybackStatus,
  ManifestStore,
  ActiveManifest,
} from '../types.js';
import { providerInfoFromSocialUrl } from '../providers/SocialProviders.js';

/**
 * video.js MenuButton internals not exposed in public typings.
 * Extends VjsComponent so TypeScript allows direct downcasts without `unknown`.
 */
interface MenuButtonInternals extends VjsComponent {
  options_: { menuItems: Array<{ label: string; id: string }>; [key: string]: unknown };
  player_: unknown;
  buttonPressed_: boolean;
  pressButton(): void;
  unpressButton(): void;
  items?: VjsComponent[];
}

/**
 * video.js MenuItem internals not exposed in public typings.
 */
interface MenuItemInternals extends VjsComponent {
  options_: { label: string; id: string; [key: string]: unknown };
  handleClick: () => void;
}

const MENU_BUTTON_COMPONENT_NAME = 'C2PAMenuButton';
const CONTROL_TEXT = 'Content Credentials';
const TWENTY_MINUTES_IN_SECONDS = 20 * 60;
// Values longer than this are truncated in the menu to prevent layout overflow
const LONG_VALUE_CHARACTER_THRESHOLD = 23;

type MenuItemKey =
  | 'SIG_ISSUER'
  | 'CERT_SUBJECT'
  | 'DATE'
  | 'CLAIM_GENERATOR'
  | 'NAME'
  | 'LOCATION'
  | 'WEBSITE'
  | 'SOCIAL'
  | 'VALIDATION_STATUS'
  | 'ALERT';

const MENU_ITEM_LABELS: Record<MenuItemKey, string> = {
  SIG_ISSUER: 'Issued by',
  CERT_SUBJECT: 'Subject name',
  DATE: 'Issued on',
  CLAIM_GENERATOR: 'App or device used',
  NAME: 'Name',
  LOCATION: 'Location',
  WEBSITE: 'Website',
  SOCIAL: 'Social Media',
  VALIDATION_STATUS: 'Current Validation Status',
  ALERT: 'Alert',
};

const MENU_ITEM_KEYS = Object.keys(MENU_ITEM_LABELS) as MenuItemKey[];

let menuComponentRegistered = false;

function ensureMenuComponentRegistered(): void {
  if (menuComponentRegistered) return;

  const MenuButton = videojs.getComponent('MenuButton');
  const MenuItem = videojs.getComponent('MenuItem');

  class C2PAMenuButton extends MenuButton {
    // video.js internal properties — exist at runtime but aren't in public typings
    declare options_: MenuButtonInternals['options_'];
    declare player_: MenuButtonInternals['player_'];
    declare buttonPressed_: boolean;
    declare pressButton: () => void;

    private closeOnNextClick = false;

    createItems(): VjsComponent[] {
      return this.options_.menuItems.map((item) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MenuItem constructor types are incomplete
        const menuItem = new (MenuItem as any)(this.player_, { label: item.label, id: item.id });
        (menuItem as MenuItemInternals).handleClick = () => {};
        return menuItem as VjsComponent;
      });
    }

    handleClick(): void {
      if (this.buttonPressed_) {
        this.closeOnNextClick = true;
        this.unpressButton();
      } else {
        this.pressButton();
      }
    }

    unpressButton(): void {
      if (this.closeOnNextClick) {
        this.closeOnNextClick = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unpressButton exists at runtime but not in MenuButton typings
        (MenuButton.prototype as any).unpressButton.call(this);
      }
    }

    buildCSSClass(): string {
      return 'vjs-chapters-button';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registerComponent expects typeof Component; subclass is not directly assignable
  videojs.registerComponent(MENU_BUTTON_COMPONENT_NAME, C2PAMenuButton as any);
  menuComponentRegistered = true;
}

/**
 * Registers and adds the C2PA content credentials menu button to the player control bar.
 * Returns the added menu button component.
 */
export function initializeMenu(videoPlayer: VideoJsPlayer): VjsComponent {
  ensureMenuComponentRegistered();

  const existingButton = videoPlayer.controlBar.getChild(MENU_BUTTON_COMPONENT_NAME);
  if (existingButton) {
    videoPlayer.controlBar.removeChild(existingButton);
  }

  const menuItems = MENU_ITEM_KEYS.map((key) => ({ label: MENU_ITEM_LABELS[key], id: key }));

  videoPlayer.controlBar.addChild(
    MENU_BUTTON_COMPONENT_NAME,
    {
      controlText: CONTROL_TEXT,
      title: CONTROL_TEXT,
      menuItems,
      className: 'c2pa-menu-button',
    },
    0,
  );

  return videoPlayer.controlBar.getChild(MENU_BUTTON_COMPONENT_NAME)!;
}

/**
 * Resizes the menu content to match the player dimensions.
 * This is a workaround — video.js does not expose a resize event for menu content.
 */
export function adjustMenuSize(
  c2paMenu: VjsComponent,
  videoPlayer: VideoJsPlayer,
  heightOffset: number,
): void {
  const menuContent = c2paMenu
    .el()
    ?.querySelector('.vjs-menu-button-popup .vjs-menu .vjs-menu-content') as HTMLElement | null;

  if (!menuContent) return;

  const playerEl = videoPlayer.el() as HTMLElement;
  menuContent.style.width = `${playerEl.offsetWidth}px`;
  menuContent.style.height = `${playerEl.offsetHeight - heightOffset}px`;
}

/**
 * Updates all menu item DOM nodes with values extracted from the current playback status.
 */
export function updateMenuItems(
  c2paMenu: VjsComponent,
  status: PlaybackStatus,
  isMonolithic: boolean,
  videoPlayer: VideoJsPlayer,
  getCompromisedRegions: () => string[],
): void {
  const items: VjsComponent[] = (c2paMenu as MenuButtonInternals).items ?? [];
  const compromisedRegions = filterRecentCompromisedRegions(
    getCompromisedRegions(),
    isMonolithic,
    videoPlayer,
  );

  for (const item of items) {
    const options = (item as MenuItemInternals).options_;
    const key = options?.id as MenuItemKey;
    const label = options?.label as string;

    const value = extractMenuValue(key, status, compromisedRegions);

    if (value !== null) {
      (item.el() as HTMLElement).style.display = 'block';
      item.el().innerHTML = renderMenuItemHtml(key, label, value);

      if (key === 'VALIDATION_STATUS' && value === 'Failed') {
        item.el().classList.add('validation-padding');
      }
    } else {
      (item.el() as HTMLElement).style.display = 'none';
    }
  }
}

// --- Private helpers ---

function filterRecentCompromisedRegions(
  allRegions: string[],
  isMonolithic: boolean,
  videoPlayer: VideoJsPlayer,
): string[] {
  if (isMonolithic) return allRegions;

  const currentTime = videoPlayer.currentTime();
  const cutoffTime = Math.max(0, currentTime - TWENTY_MINUTES_IN_SECONDS);

  return allRegions.filter((region) => {
    const [startStr] = region.split('-');
    const [minutes, seconds] = startStr.split(':').map(Number);
    return minutes * 60 + seconds >= cutoffTime;
  });
}

function extractMenuValue(
  key: MenuItemKey,
  status: PlaybackStatus,
  compromisedRegions: string[],
): string | string[] | null {
  const manifestStore = extractManifestStore(status);
  const activeManifest = resolveActiveManifest(manifestStore);

  const sigInfo = activeManifest?.signatureInfo ?? activeManifest?.signature_info;

  switch (key) {
    case 'SIG_ISSUER':
      return sigInfo?.issuer ?? null;

    case 'CERT_SUBJECT':
      return sigInfo?.cert_subject ?? null;

    case 'DATE': {
      const timeValue = sigInfo?.time ?? sigInfo?.certNotBefore;
      if (!timeValue) return null;
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).format(new Date(timeValue));
    }

    case 'CLAIM_GENERATOR':
      return activeManifest?.claimGenerator ?? activeManifest?.claim_generator ?? null;

    case 'NAME': {
      const cw = activeManifest?.assertions?.find((a) => a.label === 'stds.schema-org.CreativeWork');
      const authors = cw?.data?.author as Array<{ name?: string }> | undefined;
      return authors?.[0]?.name ?? null;
    }

    case 'VALIDATION_STATUS':
      return resolveValidationStatusLabel(status.verified);

    case 'ALERT':
      return buildAlertMessage(compromisedRegions);

    default:
      return null;
  }
}

function extractManifestStore(status: PlaybackStatus): ManifestStore | null {
  try {
    const manifest = status.details.video?.manifest as Record<string, unknown> | undefined;
    if (!manifest) return null;

    if (manifest.manifestStore) return manifest.manifestStore as ManifestStore;

    if (manifest.signatureInfo != null || manifest.signature_info != null || 'claimGenerator' in manifest) {
      return { activeManifest: manifest as unknown as ActiveManifest };
    }

    return null;
  } catch (error) {
    console.warn('[C2paMenu] Failed to extract manifest from playback status:', error);
    return null;
  }
}

function resolveActiveManifest(manifestStore: ManifestStore | null): ActiveManifest | null {
  if (!manifestStore) return null;
  if (manifestStore.activeManifest) return manifestStore.activeManifest;
  const snakeCaseKey = manifestStore.active_manifest;
  if (snakeCaseKey) return manifestStore.manifests?.[snakeCaseKey] ?? null;
  return null;
}

function resolveValidationStatusLabel(verified: boolean | undefined): string {
  if (verified === true) return 'Passed';
  if (verified === false) return 'Failed';
  return 'Unknown';
}

function buildAlertMessage(compromisedRegions: string[]): string | null {
  if (compromisedRegions.length === 0) return null;
  return `The segment between ${compromisedRegions.join(', ')} may have been tampered with`;
}

function renderMenuItemHtml(key: MenuItemKey, label: string, value: string | string[]): string {
  if (key === 'SOCIAL' && Array.isArray(value)) {
    const links = value.map((url) => {
      const name = providerInfoFromSocialUrl(url).name;
      return `<span><a class="url" href="${url}" target="_blank" rel="noopener noreferrer">${name}</a></span>`;
    });
    return `<span class="itemName">${label}</span> ${links.join('\n')}`;
  }

  if (key === 'WEBSITE' && typeof value === 'string') {
    return `<div class="itemName">${label}</div><a class="url" href="${value}" target="_blank" rel="noopener noreferrer">${value}</a>`;
  }

  if (key === 'ALERT' && typeof value === 'string') {
    return `<div class="alert-div"><img class="alert-icon" alt="alert"><div class="alert-content-scrollable">${value}</div></div>`;
  }

  if (key === 'VALIDATION_STATUS' && value === 'Failed') {
    return `<span class="itemName nextLine">${label}</span>`;
  }

  const displayValue = Array.isArray(value) ? value.join(', ') : value;
  if (displayValue.length >= LONG_VALUE_CHARACTER_THRESHOLD) {
    return `<div class="itemName">${label}</div>${displayValue}`;
  }

  return `<span class="itemName">${label}</span> ${displayValue}`;
}
