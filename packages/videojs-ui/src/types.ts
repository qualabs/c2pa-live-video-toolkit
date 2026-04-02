/**
 * Minimal interface for a video.js component instance.
 * Only the subset of the Component API this package actually uses.
 */
export interface VjsComponent {
  el(): Element;
}

/**
 * Minimal interface for the video.js seekbar component.
 */
interface VjsSeekBar extends VjsComponent {
  addChild(name: string): void;
  getChild(name: string): VjsComponent | undefined;
}

/**
 * Minimal interface for the video.js control bar component.
 */
interface VjsControlBar extends VjsComponent {
  progressControl: { seekBar: VjsSeekBar };
  getChild(name: string): VjsComponent | undefined;
  removeChild(child: VjsComponent): void;
  addChild(name: string, options?: Record<string, unknown>, index?: number): VjsComponent;
}

/**
 * Minimal interface for the video.js Player this package requires.
 * Defined locally (ISP) to avoid coupling to a specific @types/video.js version.
 * Any real video.js Player instance is structurally compatible with this interface.
 */
export interface VideoJsPlayer {
  controlBar: VjsControlBar;
  el(): Element;
  /** Returns the current playback position in seconds. */
  currentTime(): number;
  /** Returns the total duration in seconds. */
  duration(): number;
  play(): Promise<void> | void;
  pause(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Minimal PlaybackStatus shape consumed from C2paController events.
 * Defined locally to avoid a hard dependency on dashjs-plugin.
 */
export type MediaType = 'video' | 'audio';

export type PlaybackStatusDetail = {
  verified: boolean | undefined;
  manifest: unknown;
  error: string | null;
};

export type PlaybackStatus = {
  verified: boolean | undefined;
  details: Partial<Record<MediaType, PlaybackStatusDetail>>;
};

/**
 * Minimal interface for the C2paController events this package consumes.
 * Any object with these two methods is compatible — no direct import needed.
 */
export type C2paControllerEvents = {
  on(event: 'playbackStatus', handler: (status: PlaybackStatus) => void): void;
  off(event: 'playbackStatus', handler: (status: PlaybackStatus) => void): void;
};

export type C2paPlayerOptions = {
  /** Whether the stream is a fully pre-validated (monolithic) video. Default: false. */
  isMonolithic?: boolean;
  /** Show the friction modal when the initial manifest is invalid. Default: true. */
  showFrictionModal?: boolean;
};

export type C2paPlayerInstance = {
  /** Unsubscribes from all events and cleans up DOM elements. */
  destroy(): void;
};
