import videojs from 'video.js';
import type {
  VideoJsPlayer,
  VjsComponent,
  VjsMenuItemConstructor,
  VjsMenuButtonPrototype,
  PlaybackStatus,
} from '../types.js';
import { VALIDATION_STATUS_VALUES } from '../types.js';
import { extractMenuValue, renderMenuItemHtml, MenuItemKey } from './MenuValueExtractor.js';

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
    // video.js internal properties — exist at runtime but aren't in public typings
    declare options_: MenuButtonInternals['options_'];
    declare player_: MenuButtonInternals['player_'];
    declare buttonPressed_: boolean;
    declare pressButton: () => void;

    private closeOnNextClick = false;

    createItems(): VjsComponent[] {
      const TypedMenuItem = MenuItem as VjsMenuItemConstructor;
      return this.options_.menuItems.map((item) => {
        const menuItem = new TypedMenuItem(this.player_, { label: item.label, id: item.id });
        (menuItem as MenuItemInternals).handleClick = () => {};
        return menuItem;
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
        (MenuButton.prototype as unknown as VjsMenuButtonPrototype).unpressButton.call(this);
      }
    }

    buildCSSClass(): string {
      return 'vjs-chapters-button';
    }
  }

  videojs.registerComponent(MENU_BUTTON_COMPONENT_NAME, C2PAMenuButton as typeof MenuButton);
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
    videoPlayer.currentTime(),
  );

  for (const item of items) {
    const options = (item as MenuItemInternals).options_;
    const key = options?.id as MenuItemKey;
    const label = options?.label as string;

    const value = extractMenuValue(key, status, compromisedRegions);

    if (value !== null) {
      (item.el() as HTMLElement).style.display = 'block';
      item.el().innerHTML = renderMenuItemHtml(key, label, value);

      if (key === 'VALIDATION_STATUS' && value === VALIDATION_STATUS_VALUES.FAILED) {
        item.el().classList.add('validation-padding');
      }
    } else {
      (item.el() as HTMLElement).style.display = 'none';
    }
  }
}

// --- Private helpers ---

export function filterRecentCompromisedRegions(
  allRegions: string[],
  isMonolithic: boolean,
  currentTime: number,
): string[] {
  if (isMonolithic) return allRegions;

  const cutoffTime = Math.max(0, currentTime - TWENTY_MINUTES_IN_SECONDS);

  return allRegions.filter((region) => {
    const [startStr] = region.split('-');
    const [minutes, seconds] = startStr.split(':').map(Number);
    return minutes * 60 + seconds >= cutoffTime;
  });
}
