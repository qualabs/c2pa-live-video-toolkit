import { useEffect, useRef, useState } from 'react';
import { MediaPlayer } from 'dashjs';
import type { MediaPlayerClass } from 'dashjs';
import { attachC2pa, C2paEvent, SegmentStatus } from '@qualabs/c2pa-live-dashjs-plugin';
import type { DashjsPlayer } from '@qualabs/c2pa-live-dashjs-plugin';
import type {
  C2paController,
  SegmentRecord,
  InitProcessedEvent,
} from '@qualabs/c2pa-live-dashjs-plugin';
import { resolveStreamUrl, SEEK_BACK_OFFSET_SECONDS } from './playerUtils.js';

// Augmented record that carries the period it was emitted in.
// Incremented each time an init segment is processed, so segments from
// period 0 content, period 1 ads, and period 2 content sort independently.
export type TaggedSegmentRecord = SegmentRecord & { _periodIndex: number };

export type C2paPlayerState = {
  segments: TaggedSegmentRecord[];
  initData: InitProcessedEvent | null;
};

export type UseC2paPlayerResult = {
  videoRef: React.RefObject<HTMLVideoElement>;
  c2paController: C2paController | null;
  state: C2paPlayerState;
  changeStream: (url: string) => void;
};

/**
 * Configures a dash.js player with C2PA validation via attachC2pa().
 * Manages segment and init segment state reactively for React consumers.
 *
 * Must be used with a <video> element referenced by videoRef.
 * attachC2pa() must be called before player.initialize() — this hook ensures that.
 */
export function useC2paPlayer(videoSrc?: string): UseC2paPlayerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dashPlayerRef = useRef<MediaPlayerClass | null>(null);
  const c2paControllerRef = useRef<C2paController | null>(null);
  const isInitializedRef = useRef(false);
  // Capture the initial videoSrc so the mount effect is truly mount-only
  const initialVideoSrcRef = useRef(videoSrc);

  const periodIndexRef = useRef(0);
  const isInAdPeriodRef = useRef(false);

  const [c2paController, setC2paController] = useState<C2paController | null>(null);
  const [state, setState] = useState<C2paPlayerState>({ segments: [], initData: null });
  const [currentStreamUrl, setCurrentStreamUrl] = useState(() => resolveStreamUrl(videoSrc));

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const streamUrl = resolveStreamUrl(initialVideoSrcRef.current);
    setCurrentStreamUrl(streamUrl);

    const dashPlayer = MediaPlayer().create();
    dashPlayerRef.current = dashPlayer;

    const controller = attachC2pa(dashPlayer as unknown as DashjsPlayer);
    c2paControllerRef.current = controller;
    setC2paController(controller);

    controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
      if (isInAdPeriodRef.current && record.status !== SegmentStatus.UNVERIFIED) {
        periodIndexRef.current += 1;
        isInAdPeriodRef.current = false;
      }
      const periodIndex = periodIndexRef.current;
      setState((prev) => ({
        ...prev,
        segments: [...prev.segments, { ...record, _periodIndex: periodIndex }],
      }));
    });

    controller.on(C2paEvent.INIT_PROCESSED, (event) => {
      periodIndexRef.current += 1;
      isInAdPeriodRef.current = event.noC2paData ?? false;
      setState((prev) => ({ ...prev, initData: event }));
    });

    dashPlayer.on('error', (e: unknown) => {
      const event = e as { error?: unknown };
      console.warn('[player-demo] dash.js error:', event.error);
      // Seek to end of buffer to recover from gap attacks
      const videoEl = videoRef.current;
      if (videoEl) {
        const ranges = videoEl.buffered;
        if (ranges.length) {
          videoEl.currentTime = ranges.end(ranges.length - 1) - SEEK_BACK_OFFSET_SECONDS;
        }
      }
    });

    dashPlayer.initialize(videoRef.current!, streamUrl, true);

    return () => {
      controller.detach();
      dashPlayer.reset();
      dashPlayerRef.current = null;
      c2paControllerRef.current = null;
      isInitializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dashPlayerRef.current || !isInitializedRef.current) return;
    if (!videoSrc || videoSrc === currentStreamUrl) return;
    setCurrentStreamUrl(videoSrc);
    c2paControllerRef.current?.reset();
    periodIndexRef.current = 0;
    isInAdPeriodRef.current = false;
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(videoSrc);
  }, [videoSrc, currentStreamUrl]);

  function changeStream(url: string): void {
    if (!dashPlayerRef.current) return;
    setCurrentStreamUrl(url);
    c2paControllerRef.current?.reset();
    periodIndexRef.current = 0;
    isInAdPeriodRef.current = false;
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(url);
  }

  return { videoRef, c2paController, state, changeStream };
}
