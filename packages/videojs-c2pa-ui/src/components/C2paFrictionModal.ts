import type { VideoJsPlayer } from '../types.js';

const CSS_CLASS_OVERLAY = 'friction-overlay';
const CSS_CLASS_BUTTON = 'friction-button';
const WARNING_MESSAGE =
  "The information in this video's Content Credentials is no longer trustworthy and the video's history cannot be confirmed.";
const WATCH_ANYWAY_LABEL = 'Watch Anyway';

/**
 * Creates the friction warning overlay and appends it to the player container.
 * The overlay is hidden by default and shown via `showFrictionModal()`.
 *
 * @param onWatchAnyway - Called when the user clicks "Watch Anyway".
 * @returns The overlay DOM element.
 */
export function createFrictionModal(
  videoPlayer: VideoJsPlayer,
  onWatchAnyway: () => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = CSS_CLASS_OVERLAY;
  overlay.style.display = 'none';

  const message = document.createElement('p');
  message.textContent = WARNING_MESSAGE;

  const button = document.createElement('button');
  button.textContent = WATCH_ANYWAY_LABEL;
  button.classList.add(CSS_CLASS_BUTTON);
  button.addEventListener('click', () => {
    overlay.style.display = 'none';
    onWatchAnyway();
    // Intentional floating promise — play() rejection is handled by video.js error events
    void videoPlayer.play();
  });

  overlay.appendChild(message);
  overlay.appendChild(button);
  (videoPlayer.el() as HTMLElement).appendChild(overlay);

  return overlay;
}

/**
 * Pauses the player and displays the friction overlay.
 * Only shows if the overlay exists and has not been dismissed yet.
 */
export function showFrictionModal(overlay: HTMLElement, videoPlayer: VideoJsPlayer): void {
  videoPlayer.pause();
  overlay.style.display = 'block';
}
