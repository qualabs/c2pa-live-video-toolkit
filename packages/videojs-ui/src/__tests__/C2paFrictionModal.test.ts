import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFrictionModal, showFrictionModal } from '../components/C2paFrictionModal.js';
import type { VideoJsPlayer } from '../types.js';

function makePlayer(): VideoJsPlayer & { playerEl: HTMLElement } {
  const playerEl = document.createElement('div');
  document.body.appendChild(playerEl);
  return {
    playerEl,
    el: () => playerEl,
    currentTime: () => 0,
    duration: () => 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    on: vi.fn(),
    controlBar: null as unknown as VideoJsPlayer['controlBar'],
  };
}

describe('createFrictionModal', () => {
  let player: ReturnType<typeof makePlayer>;

  beforeEach(() => {
    player = makePlayer();
  });

  it('appends the overlay to the player element', () => {
    createFrictionModal(player, vi.fn());

    const overlay = player.playerEl.querySelector('.friction-overlay');
    expect(overlay).not.toBeNull();
  });

  it('is hidden by default', () => {
    createFrictionModal(player, vi.fn());

    const overlay = player.playerEl.querySelector<HTMLElement>('.friction-overlay')!;
    expect(overlay.style.display).toBe('none');
  });

  it('contains the warning message text', () => {
    createFrictionModal(player, vi.fn());

    const overlay = player.playerEl.querySelector('.friction-overlay')!;
    expect(overlay.textContent).toContain('Content Credentials');
  });

  it('contains a "Watch Anyway" button', () => {
    createFrictionModal(player, vi.fn());

    const button = player.playerEl.querySelector('.friction-button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('Watch Anyway');
  });

  it('hides the overlay and calls onWatchAnyway when button is clicked', () => {
    const onWatchAnyway = vi.fn();
    createFrictionModal(player, onWatchAnyway);

    const button = player.playerEl.querySelector<HTMLButtonElement>('.friction-button')!;
    button.click();

    const overlay = player.playerEl.querySelector<HTMLElement>('.friction-overlay')!;
    expect(overlay.style.display).toBe('none');
    expect(onWatchAnyway).toHaveBeenCalledOnce();
  });

  it('calls player.play() when "Watch Anyway" is clicked', () => {
    createFrictionModal(player, vi.fn());

    const button = player.playerEl.querySelector<HTMLButtonElement>('.friction-button')!;
    button.click();

    expect(player.play).toHaveBeenCalledOnce();
  });
});

describe('showFrictionModal', () => {
  it('pauses the player', () => {
    const player = makePlayer();
    const overlay = document.createElement('div');
    overlay.style.display = 'none';

    showFrictionModal(overlay, player);

    expect(player.pause).toHaveBeenCalledOnce();
  });

  it('makes the overlay visible', () => {
    const player = makePlayer();
    const overlay = document.createElement('div');
    overlay.style.display = 'none';

    showFrictionModal(overlay, player);

    expect(overlay.style.display).toBe('block');
  });
});
