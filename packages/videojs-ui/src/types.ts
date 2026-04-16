/**
 * Minimal interface for a video.js component instance.
 * Only the subset of the Component API this package actually uses.
 */
export interface VjsComponent {
  el(): Element;
}

export interface VjsMenuItemOptions {
  label: string;
  id: string;
}

export type VjsMenuItemConstructor = new (
  player: unknown,
  options: VjsMenuItemOptions,
) => VjsComponent;

export interface VjsMenuButtonPrototype {
  unpressButton(this: unknown): void;
}

interface VjsSeekBar extends VjsComponent {
  addChild(name: string): void;
  getChild(name: string): VjsComponent | undefined;
}

interface VjsControlBar extends VjsComponent {
  progressControl: { seekBar: VjsSeekBar };
  getChild(name: string): VjsComponent | undefined;
  removeChild(child: VjsComponent): void;
  addChild(name: string, options?: Record<string, unknown>, index?: number): VjsComponent;
}

export interface VideoJsPlayer {
  controlBar: VjsControlBar;
  el(): Element;
  currentTime(): number;
  duration(): number;
  play(): Promise<void> | void;
  pause(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export type MediaType = 'video' | 'audio';

export type SignatureInfo = {
  issuer?: string;
  time?: string;
  certNotBefore?: string;
};

export const CREATIVE_WORK_ASSERTION_LABEL = 'stds.schema-org.CreativeWork';

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

export const VALIDATION_STATUS_VALUES = {
  PASSED: 'Passed',
  FAILED: 'Failed',
  UNKNOWN: 'Unknown',
} as const;

/**
 * Minimal shape of a validated segment record.
 * Defined locally to avoid a hard dependency on dashjs-plugin.
 */
export type SegmentRecord = {
  status: string;
  manifest?: unknown;
};

/**
 * Minimal interface for the C2paController events this package consumes.
 * Defined locally to avoid a hard dependency on dashjs-plugin.
 */
export type C2paControllerEvents = {
  on(event: 'segmentValidated', handler: (record: SegmentRecord) => void): void;
  off(event: 'segmentValidated', handler: (record: SegmentRecord) => void): void;
};

export type C2paPlayerOptions = {
  isMonolithic?: boolean;
  showFrictionModal?: boolean;
};

export type C2paPlayerInstance = {
  destroy(): void;
};
