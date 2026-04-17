import type {
  VideoJsPlayer,
  C2paControllerEvents,
  PlaybackStatus,
  SegmentRecord,
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

const INVALID_STATUSES = new Set(['invalid', 'replayed', 'reordered', 'warning']);

function segmentToPlaybackStatus(record: SegmentRecord): PlaybackStatus {
  const verified = record.status === 'valid' ? true
    : INVALID_STATUSES.has(record.status) ? false
    : undefined;

  return {
    verified,
    details: {
      video: { verified, manifest: record.manifest ?? null, error: null },
    },
  };
}

export function C2paPlayerUI(
  videoPlayer: VideoJsPlayer,
  c2paController: C2paControllerEvents,
  options: C2paPlayerOptions = {},
): C2paPlayerInstance {
  const { isMonolithic = false, showFrictionModal: enableFrictionModal = true } = options;

  const timeline = new C2paTimeline();

  registerControlBar(videoPlayer);

  const controlBar =
    videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar')!;
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
  let latestSegment: SegmentRecord | null = null;

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

  const menuAdjustInterval = setInterval(() => {
    adjustMenuSize(menuButton, videoPlayer, MENU_HEIGHT_OFFSET);
  }, MENU_ADJUST_INTERVAL_MS);
  setTimeout(() => {
    adjustMenuSize(menuButton, videoPlayer, MENU_HEIGHT_OFFSET);
  }, INITIAL_MENU_ADJUST_DELAY_MS);

  const handleSegmentValidated = (record: SegmentRecord): void => {
    latestSegment = record;
  };

  videoPlayer.on('timeupdate', () => {
    if (!latestSegment) return;

    const currentTime = videoPlayer.currentTime();
    const timeDelta = currentTime - lastPlaybackTime;

    if (!seeking && timeDelta >= 0 && timeDelta < SEEK_TIME_THRESHOLD) {
      const status = segmentToPlaybackStatus(latestSegment);

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
  });

  c2paController.on('segmentValidated', handleSegmentValidated);

  return {
    destroy(): void {
      c2paController.off('segmentValidated', handleSegmentValidated);
      clearInterval(menuAdjustInterval);
      timeline.reset();
    },
  };
}
