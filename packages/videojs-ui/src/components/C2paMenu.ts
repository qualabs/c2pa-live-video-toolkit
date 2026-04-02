import videojs from 'video.js';
import type { VideoJsPlayer, VjsComponent, PlaybackStatus } from '../types.js';
import { providerInfoFromSocialUrl } from '../providers/SocialProviders.js';

const MENU_BUTTON_COMPONENT_NAME = 'C2PAMenuButton';
const CONTROL_TEXT = 'Content Credentials';
const TWENTY_MINUTES_IN_SECONDS = 20 * 60;
// Values longer than this are truncated in the menu to prevent layout overflow
const LONG_VALUE_CHARACTER_THRESHOLD = 23;

type MenuItemKey =
  | 'SIG_ISSUER'
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
    private closeOnNextClick = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createItems(): any[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = (this as any).options_;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return options.menuItems.map((item: { label: string; id: string }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const menuItem = new (MenuItem as any)((this as any).player_, { label: item.label, id: item.id });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (menuItem as any).handleClick = () => {};
        return menuItem;
      });
    }

    handleClick(): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((this as any).buttonPressed_) {
        this.closeOnNextClick = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).unpressButton();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).pressButton();
      }
    }

    unpressButton(): void {
      if (this.closeOnNextClick) {
        this.closeOnNextClick = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (MenuButton.prototype as any).unpressButton.call(this);
      }
    }

    buildCSSClass(): string {
      return 'vjs-chapters-button';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: VjsComponent[] = (c2paMenu as any).items ?? [];
  const compromisedRegions = filterRecentCompromisedRegions(
    getCompromisedRegions(),
    isMonolithic,
    videoPlayer,
  );

  for (const item of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (item as any).options_;
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
  const manifest = extractManifest(status);
  const activeManifest = resolveActiveManifest(manifest);

  switch (key) {
    case 'SIG_ISSUER':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (activeManifest as any)?.signatureInfo?.issuer ?? null;

    case 'DATE': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const timeValue = (activeManifest as any)?.signatureInfo?.time;
      if (!timeValue) return null;
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).format(new Date(timeValue as string));
    }

    case 'CLAIM_GENERATOR':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (activeManifest as any)?.claimGenerator ?? (activeManifest as any)?.claim_generator ?? null;

    case 'VALIDATION_STATUS':
      return resolveValidationStatusLabel(status.verified);

    case 'ALERT':
      return buildAlertMessage(compromisedRegions);

    default:
      return null;
  }
}

function extractManifest(status: PlaybackStatus): Record<string, unknown> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (status.details.video?.manifest as any)?.manifestStore ?? null;
  } catch (error) {
    console.warn('[C2paMenu] Failed to extract manifest from playback status:', error);
    return null;
  }
}

function resolveActiveManifest(manifestStore: Record<string, unknown> | null): unknown {
  if (!manifestStore) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const camelCase = (manifestStore as any).activeManifest;
  if (camelCase) return camelCase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snakeCaseKey = (manifestStore as any).active_manifest as string | undefined;
  if (snakeCaseKey) return (manifestStore as any).manifests?.[snakeCaseKey] ?? null;
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
    return `<div class="alert-div"><img class="alert-icon" alt="alert"></div><div class="alert-content-scrollable">${value}</div>`;
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
