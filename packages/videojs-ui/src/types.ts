/**
 * Minimal interface for a video.js component instance.
 * Only the subset of the Component API this package actually uses.
 */
export interface VjsComponent {
  el(): Element;
}

/**
 * Options accepted by the video.js MenuItem constructor.
 */
export interface VjsMenuItemOptions {
  label: string;
  id: string;
}

/**
 * Constructor shape for the video.js MenuItem component. The public typings do
 * not parameterize its options, so we expose the concrete signature we use.
 */
export type VjsMenuItemConstructor = new (
  player: unknown,
  options: VjsMenuItemOptions,
) => VjsComponent;

/**
 * Subset of the video.js MenuButton prototype methods our code relies on.
 * `unpressButton` exists at runtime on MenuButton but is absent from the
 * public typings. It is declared here because module augmentation does not
 * solve the case: `MenuButton` is declared only as `interface` in the public
 * typings (no constructor signature), so `class X extends getComponent('MenuButton')`
 * resolves its base to `Component` — the interface augment is never seen by
 * `super.unpressButton()`.
 */
export interface VjsMenuButtonPrototype {
  unpressButton(this: unknown): void;
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

export type SignatureInfo = {
  issuer?: string;
  time?: string;
  certNotBefore?: string;
};

export type ManifestAssertion = {
  label: string;
  data: Record<string, unknown>;
};

export type ActiveManifest = {
  signatureInfo?: SignatureInfo;
  claimGenerator?: string;
  assertions?: ManifestAssertion[];
};

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
