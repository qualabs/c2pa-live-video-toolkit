import type { VideoJsPlayer, VjsComponent } from '../types.js';

const CSS_CLASS_SEGMENT = 'seekbar-play-c2pa';
const CSS_CLASS_MENU_BUTTON_INVALID = 'c2pa-menu-button-invalid';
const CSS_SELECTOR_MENU_BUTTON = '.c2pa-menu-button button';
const CSS_SELECTOR_PLAY_PROGRESS = '.vjs-play-progress';

const CSS_VAR_PASSED = '--c2pa-passed';
const CSS_VAR_FAILED = '--c2pa-failed';
const CSS_VAR_UNKNOWN = '--c2pa-unknown';

const VERIFICATION_STATUS = {
  TRUE: 'true',
  FALSE: 'false',
  UNKNOWN: 'unknown',
} as const;

type VerificationStatus = (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

export type OnSeekingResult = {
  seeking: boolean;
  lastPlaybackTime: number;
};

/**
 * Manages the colored segment overlay on the video.js progress bar.
 * Each instance is scoped to a single player — safe for multiple players on the same page.
 */
export class C2paTimeline {
  private readonly segments: HTMLElement[] = [];

  onSeeked(): void {
    // Seeking has ended — caller is responsible for resetting the seeking flag.
  }

  onSeeking(
    currentTime: number,
    playbackStarted: boolean,
    lastPlaybackTime: number,
    isMonolithic: boolean,
    controlBar: VjsComponent,
    videoPlayer: VideoJsPlayer,
  ): OnSeekingResult {
    if (currentTime === 0) {
      this.reset(videoPlayer);
      return { seeking: false, lastPlaybackTime: 0 };
    }

    if (playbackStarted && currentTime > 0 && this.segments.length > 0) {
      this.handleSeekTo(currentTime, isMonolithic, controlBar, videoPlayer);
    }

    return { seeking: true, lastPlaybackTime };
  }

  onValidationStatusChanged(
    verified: boolean | undefined,
    currentTime: number,
    container: HTMLElement,
  ): void {
    const status = toVerificationStatus(verified);
    const lastSegment = this.segments[this.segments.length - 1];

    if (this.segments.length === 0 || lastSegment.dataset.verificationStatus !== status) {
      if (lastSegment) {
        lastSegment.dataset.endTime = String(currentTime);
      }
      const segment = this.createSegment(currentTime, currentTime, status);
      container.appendChild(segment);
      this.segments.push(segment);
    }
  }

  updateTimeline(currentTime: number, videoPlayer: VideoJsPlayer, controlBar: VjsComponent): void {
    if (this.segments.length === 0) {
      this.onValidationStatusChanged(undefined, currentTime, controlBar.el() as HTMLElement);
    }

    const lastSegment = this.segments[this.segments.length - 1];
    lastSegment.dataset.endTime = String(currentTime);

    this.syncPlayProgressColor(videoPlayer, lastSegment.style.backgroundColor);

    let hasInvalidSegment = false;
    let zIndex = this.segments.length;

    for (const segment of this.segments) {
      const startTime = parseFloat(segment.dataset.startTime ?? '');
      const endTime = parseFloat(segment.dataset.endTime ?? '');
      if (isNaN(startTime) || isNaN(endTime)) continue;
      segment.style.width = `${computeSegmentProgress(currentTime, startTime, endTime, videoPlayer.duration())}%`;
      segment.style.zIndex = String(zIndex--);

      if (segment.dataset.verificationStatus === VERIFICATION_STATUS.FALSE) {
        hasInvalidSegment = true;
      }
    }

    this.updateMenuButtonState(videoPlayer, hasInvalidSegment);
  }

  getCompromisedRegions(isMonolithic: boolean, videoPlayer: VideoJsPlayer): string[] {
    if (isMonolithic) {
      return this.getMonolithicCompromisedRegions(videoPlayer);
    }
    return this.getStreamingCompromisedRegions();
  }

  reset(videoPlayer?: VideoJsPlayer): void {
    for (const segment of this.segments) {
      segment.remove();
    }
    this.segments.length = 0;

    if (videoPlayer) {
      this.updateMenuButtonState(videoPlayer, false);
    }
  }

  // --- Private helpers ---

  private handleSeekTo(
    seekTime: number,
    isMonolithic: boolean,
    controlBar: VjsComponent,
    videoPlayer: VideoJsPlayer,
  ): void {
    this.removeSegmentsBeyondSeekTime(seekTime);
    this.adjustLastSegmentBoundary(seekTime, isMonolithic, controlBar);
    this.updateTimeline(seekTime, videoPlayer, controlBar);
  }

  private removeSegmentsBeyondSeekTime(seekTime: number): void {
    const active = this.segments.filter((segment) => {
      const start = parseFloat(segment.dataset.startTime ?? '');
      const end = parseFloat(segment.dataset.endTime ?? '');
      if (isNaN(start) || isNaN(end)) return true;
      const isActive = seekTime >= end || (seekTime >= start && seekTime < end);
      if (!isActive) segment.remove();
      return isActive;
    });

    this.segments.length = 0;
    this.segments.push(...active);
  }

  private adjustLastSegmentBoundary(
    seekTime: number,
    isMonolithic: boolean,
    controlBar: VjsComponent,
  ): void {
    const lastSegment = this.segments[this.segments.length - 1];
    if (!lastSegment) return;

    const lastEndTime = parseFloat(lastSegment.dataset.endTime ?? '');
    if (isNaN(lastEndTime)) return;

    if (lastEndTime > seekTime) {
      lastSegment.dataset.endTime = String(seekTime);
      return;
    }

    const isGapAhead = lastEndTime !== seekTime;
    const isAlreadyUnknown = lastSegment.dataset.verificationStatus === VERIFICATION_STATUS.UNKNOWN;

    if (!isMonolithic && isGapAhead && !isAlreadyUnknown) {
      // In streaming mode, a seek beyond the last known segment creates an unknown gap.
      const unknownSegment = this.createSegment(lastEndTime, seekTime, VERIFICATION_STATUS.UNKNOWN);
      (controlBar.el() as HTMLElement).appendChild(unknownSegment);
      this.segments.push(unknownSegment);
    }
  }

  private createSegment(
    startTime: number,
    endTime: number,
    status: VerificationStatus,
  ): HTMLElement {
    const segment = document.createElement('div');
    segment.className = CSS_CLASS_SEGMENT;
    segment.style.width = '0%';
    segment.dataset.startTime = String(startTime);
    segment.dataset.endTime = String(endTime);
    segment.dataset.verificationStatus = status;
    segment.style.backgroundColor = resolveSegmentColor(status);
    return segment;
  }

  private syncPlayProgressColor(videoPlayer: VideoJsPlayer, color: string): void {
    const playProgress = videoPlayer.el().querySelector(CSS_SELECTOR_PLAY_PROGRESS) as HTMLElement | null;
    if (playProgress) {
      playProgress.style.backgroundColor = color;
      playProgress.style.color = color;
    }
  }

  private updateMenuButtonState(videoPlayer: VideoJsPlayer, isInvalid: boolean): void {
    const button = videoPlayer.el().querySelector(CSS_SELECTOR_MENU_BUTTON) as HTMLElement | null;
    if (!button) return;

    if (isInvalid) {
      button.classList.add(CSS_CLASS_MENU_BUTTON_INVALID);
    } else {
      button.classList.remove(CSS_CLASS_MENU_BUTTON_INVALID);
    }
  }

  private getMonolithicCompromisedRegions(videoPlayer: VideoJsPlayer): string[] {
    const firstSegment = this.segments[0];
    if (firstSegment?.dataset.verificationStatus === VERIFICATION_STATUS.FALSE) {
      return [`${formatTime(0)}-${formatTime(videoPlayer.duration())}`];
    }
    return [];
  }

  private getStreamingCompromisedRegions(): string[] {
    return this.segments
      .filter((s) => s.dataset.verificationStatus === VERIFICATION_STATUS.FALSE)
      .map((s) => {
        const start = parseFloat(s.dataset.startTime ?? '');
        const end = parseFloat(s.dataset.endTime ?? '');
        if (isNaN(start) || isNaN(end)) return null;
        return `${formatTime(start)}-${formatTime(end)}`;
      })
      .filter((r): r is string => r !== null);
  }
}

// --- Module-level pure helpers ---

function toVerificationStatus(verified: boolean | undefined): VerificationStatus {
  if (typeof verified === 'boolean') return String(verified) as VerificationStatus;
  return VERIFICATION_STATUS.UNKNOWN;
}

function resolveSegmentColor(status: VerificationStatus): string {
  const variableByStatus: Record<VerificationStatus, string> = {
    [VERIFICATION_STATUS.TRUE]: CSS_VAR_PASSED,
    [VERIFICATION_STATUS.FALSE]: CSS_VAR_FAILED,
    [VERIFICATION_STATUS.UNKNOWN]: CSS_VAR_UNKNOWN,
  };
  return getComputedStyle(document.documentElement).getPropertyValue(variableByStatus[status]).trim();
}

function computeSegmentProgress(
  currentTime: number,
  startTime: number,
  endTime: number,
  duration: number,
): number {
  if (duration <= 0) return 0;
  if (currentTime >= startTime && currentTime <= endTime) return (currentTime / duration) * 100;
  if (currentTime >= endTime) return (endTime / duration) * 100;
  return 0;
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
