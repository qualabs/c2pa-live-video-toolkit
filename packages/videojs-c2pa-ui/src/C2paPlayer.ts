import type {
  VideoJsPlayer,
  C2paControllerEvents,
  PlaybackStatus,
  C2paPlayerOptions,
  C2paPlayerInstance,
} from './types.js';
import { registerControlBar } from './components/C2paControlBar.js';
import { C2paTimeline } from './components/C2paTimeline.js';
import { initializeMenu, adjustMenuSize, updateMenuItems } from './components/C2paMenu.js';
import { createFrictionModal, showFrictionModal } from './components/C2paFrictionModal.js';

const MENU_HEIGHT_OFFSET = 30;
const SEEK_TIME_THRESHOLD = 0.5;
const MENU_ADJUST_INTERVAL_MS = 500;
const INITIAL_MENU_ADJUST_DELAY_MS = 100;

/**
 * Attaches C2PA UI overlays to a video.js player and wires them to a C2paController.
 *
 * @example
 * ```ts
 * import { C2paPlayerUI } from '@c2pa-live-toolkit/videojs-c2pa-ui';
 * import '@c2pa-live-toolkit/videojs-c2pa-ui/styles';
 *
 * const ui = C2paPlayerUI(videoJsPlayer, c2paController);
 *
 * // Later, when tearing down:
 * ui.destroy();
 * ```
 */
export function C2paPlayerUI(
  videoPlayer: VideoJsPlayer,
  c2paController: C2paControllerEvents,
  options: C2paPlayerOptions = {},
): C2paPlayerInstance {
  const { isMonolithic = false, showFrictionModal: enableFrictionModal = true } = options;

  const timeline = new C2paTimeline();

  registerControlBar(videoPlayer);

  const controlBar = videoPlayer.controlBar.progressControl.seekBar.getChild(
    'C2PALoadProgressBar',
  )!;
  const menuButton = initializeMenu(videoPlayer);

  let frictionModal: HTMLElement | undefined;
  let playbackStarted = false;

  if (enableFrictionModal) {
    frictionModal = createFrictionModal(videoPlayer, () => {
      playbackStarted = true;
    });
  }

  let seeking = false;
  let lastPlaybackTime = 0;
  let isManifestInvalid = false;

  videoPlayer.on('play', () => {
    if (frictionModal && isManifestInvalid && !playbackStarted) {
      showFrictionModal(frictionModal, videoPlayer);
    } else {
      playbackStarted = true;
    }
  });

  videoPlayer.on('seeked', () => {
    timeline.onSeeked();
    seeking = false;
  });

  videoPlayer.on('seeking', () => {
    const result = timeline.onSeeking(
      videoPlayer.currentTime(),
      playbackStarted,
      lastPlaybackTime,
      isMonolithic,
      controlBar,
      videoPlayer,
    );
    seeking = result.seeking;
    lastPlaybackTime = result.lastPlaybackTime;
  });

  // Workaround: video.js has no resize event for menu content, so we poll periodically.
  const menuAdjustInterval = setInterval(() => {
    adjustMenuSize(menuButton, videoPlayer, MENU_HEIGHT_OFFSET);
  }, MENU_ADJUST_INTERVAL_MS);
  setTimeout(() => {
    adjustMenuSize(menuButton, videoPlayer, MENU_HEIGHT_OFFSET);
  }, INITIAL_MENU_ADJUST_DELAY_MS);

  const handlePlaybackStatus = (status: PlaybackStatus): void => {
    const currentTime = videoPlayer.currentTime();
    const timeDelta = currentTime - lastPlaybackTime;

    if (!seeking && timeDelta >= 0 && timeDelta < SEEK_TIME_THRESHOLD) {
      timeline.onValidationStatusChanged(
        status.verified,
        currentTime,
        controlBar.el() as HTMLElement,
      );
      timeline.updateTimeline(currentTime, videoPlayer, controlBar);
      updateMenuItems(menuButton, status, isMonolithic, videoPlayer, () =>
        timeline.getCompromisedRegions(isMonolithic, videoPlayer),
      );

      if (status.verified === false) {
        isManifestInvalid = true;
      }
    }

    lastPlaybackTime = currentTime;
  };

  c2paController.on('playbackStatus', handlePlaybackStatus);

  return {
    destroy(): void {
      c2paController.off('playbackStatus', handlePlaybackStatus);
      clearInterval(menuAdjustInterval);
      timeline.reset();
    },
  };
}
