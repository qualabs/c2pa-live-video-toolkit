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
import { filterRecentCompromisedRegions } from '../CompromisedRegionsFilter.js';

interface MenuButtonInternals extends VjsComponent {
  options_: { menuItems: Array<MenuItemDef>; [key: string]: unknown };
  player_: unknown;
  buttonPressed_: boolean;
  pressButton(): void;
  unpressButton(): void;
  items?: VjsComponent[];
}

interface MenuItemInternals extends VjsComponent {
  options_: { label: string; id: string; [key: string]: unknown };
  handleClick: () => void;
}

type ColumnSide = 'header' | 'left' | 'right' | 'full' | 'absolute';

type MenuItemDef = {
  key: MenuItemKey;
  label: string;
  side: ColumnSide;
};

const MENU_BUTTON_COMPONENT_NAME = 'C2PAMenuButton';
const CONTROL_TEXT = 'Content Credentials';

// Item order matters: with `grid-auto-flow: row dense` the dual header takes row 1
// (spanning both columns); left items then fill column 1 starting row 2; the dense
// flag backfills empty column-2 cells with the right items in DOM order.
// First items of each column get `c2pa-col-first` so the border-top is suppressed.
const MENU_ITEMS: MenuItemDef[] = [
  { key: MenuItemKey.DUAL_HEADER, label: 'Headers', side: 'header' },
  { key: MenuItemKey.SIG_ISSUER, label: 'Issued by', side: 'left' },
  { key: MenuItemKey.SUBJECT_NAME, label: 'Subject name', side: 'left' },
  { key: MenuItemKey.CLAIM_GENERATOR, label: 'Claim generator', side: 'left' },
  { key: MenuItemKey.CAWG_ISSUED_BY, label: 'Issued by', side: 'right' },
  { key: MenuItemKey.CAWG_SUBJECT_NAME, label: 'Subject name', side: 'right' },
  { key: MenuItemKey.ORGANIZATION, label: 'Organization', side: 'right' },
  { key: MenuItemKey.STATION_ID, label: 'Station ID', side: 'right' },
  { key: MenuItemKey.PROGRAM, label: 'Program', side: 'right' },
  { key: MenuItemKey.VALIDATION_STATUS, label: 'Current Validation Status', side: 'absolute' },
  { key: MenuItemKey.ALERT, label: 'Alert', side: 'full' },
];

// Keys whose menu item is the first of its column — used to drop the border-top.
const FIRST_OF_COLUMN: ReadonlySet<MenuItemKey> = new Set([
  MenuItemKey.SIG_ISSUER,
  MenuItemKey.CAWG_ISSUED_BY,
]);

let menuComponentRegistered = false;

const SIDE_CLASS: Record<ColumnSide, string> = {
  header: 'c2pa-dual-header',
  left: 'c2pa-col-left',
  right: 'c2pa-col-right',
  full: 'c2pa-col-full',
  absolute: 'c2pa-validation-status',
};

function ensureMenuComponentRegistered(): void {
  if (menuComponentRegistered) return;

  const MenuButton = videojs.getComponent('MenuButton');
  const MenuItem = videojs.getComponent('MenuItem');

  class C2PAMenuButton extends MenuButton {
    declare options_: MenuButtonInternals['options_'];
    declare player_: MenuButtonInternals['player_'];
    declare buttonPressed_: boolean;
    declare pressButton: () => void;

    private closeOnNextClick = false;

    createItems(): VjsComponent[] {
      const TypedMenuItem = MenuItem as VjsMenuItemConstructor;
      return this.options_.menuItems.map((item) => {
        const menuItem = new TypedMenuItem(this.player_, { label: item.label, id: item.key });
        (menuItem as MenuItemInternals).handleClick = () => {};
        const el = menuItem.el() as HTMLElement | null;
        if (el) {
          el.classList.add(SIDE_CLASS[item.side]);
          el.classList.add(`c2pa-key-${item.key}`);
          if (item.key === MenuItemKey.DUAL_HEADER) {
            el.classList.add('c2pa-col-first', 'c2pa-subheader');
          }
          if (FIRST_OF_COLUMN.has(item.key)) {
            el.classList.add('c2pa-col-first');
          }
        }
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

  videoPlayer.controlBar.addChild(
    MENU_BUTTON_COMPONENT_NAME,
    {
      controlText: CONTROL_TEXT,
      title: CONTROL_TEXT,
      menuItems: MENU_ITEMS,
      className: 'c2pa-menu-button',
    },
    0,
  );

  return videoPlayer.controlBar.getChild(MENU_BUTTON_COMPONENT_NAME)!;
}

/**
 * Resizes the menu content to match the player dimensions.
 */
export function adjustMenuSize(
  c2paMenu: VjsComponent,
  videoPlayer: VideoJsPlayer,
  heightOffset: number,
): void {
  const menuEl = c2paMenu
    .el()
    ?.querySelector('.vjs-menu-button-popup .vjs-menu') as HTMLElement | null;
  const menuContent = c2paMenu
    .el()
    ?.querySelector('.vjs-menu-button-popup .vjs-menu .vjs-menu-content') as HTMLElement | null;

  if (!menuContent) return;

  const playerEl = videoPlayer.el() as HTMLElement;
  const playerHeight = playerEl.offsetHeight - heightOffset;
  if (menuEl) {
    menuEl.style.height = `${playerHeight}px`;
    menuEl.style.bottom = '0';
  }
  menuContent.style.width = `${playerEl.offsetWidth}px`;
  menuContent.style.height = `${playerHeight}px`;
  menuContent.style.maxHeight = `${playerHeight}px`;
  menuContent.style.overflowY = 'auto';
  menuContent.style.overflowX = 'hidden';
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
      (item.el() as HTMLElement).style.display = '';
      item.el().innerHTML = renderMenuItemHtml(key, label, value);

      if (key === MenuItemKey.VALIDATION_STATUS && value === VALIDATION_STATUS_VALUES.FAILED) {
        item.el().classList.add('validation-padding');
      }
    } else {
      (item.el() as HTMLElement).style.display = 'none';
    }
  }
}
