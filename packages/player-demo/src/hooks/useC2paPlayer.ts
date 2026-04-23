import { useEffect, useRef, useState } from 'react';
import dashjs from 'dashjs';
import { attachC2pa, C2paEvent } from '@qualabs/c2pa-live-dashjs-plugin';
import type {
  C2paController,
  SegmentRecord,
  InitProcessedEvent,
} from '@qualabs/c2pa-live-dashjs-plugin';
import { resolveStreamUrl, SEEK_BACK_OFFSET_SECONDS } from './playerUtils.js';

export type C2paPlayerState = {
  segments: SegmentRecord[];
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
  const dashPlayerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const c2paControllerRef = useRef<C2paController | null>(null);
  const isInitializedRef = useRef(false);
  // Capture the initial videoSrc so the mount effect is truly mount-only
  const initialVideoSrcRef = useRef(videoSrc);

  const [c2paController, setC2paController] = useState<C2paController | null>(null);
  const [state, setState] = useState<C2paPlayerState>({ segments: [], initData: null });
  const [currentStreamUrl, setCurrentStreamUrl] = useState(() => resolveStreamUrl(videoSrc));

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const streamUrl = resolveStreamUrl(initialVideoSrcRef.current);
    setCurrentStreamUrl(streamUrl);

    const dashPlayer = dashjs.MediaPlayer().create();
    dashPlayerRef.current = dashPlayer;

    const controller = attachC2pa(dashPlayer);
    c2paControllerRef.current = controller;
    setC2paController(controller);

    controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
      setState((prev) => ({ ...prev, segments: [...prev.segments, record] }));
    });

    controller.on(C2paEvent.INIT_PROCESSED, (event) => {
      setState((prev) => ({ ...prev, initData: event }));
    });

    dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e: unknown) => {
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
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(videoSrc);
  }, [videoSrc, currentStreamUrl]);

  function changeStream(url: string): void {
    if (!dashPlayerRef.current) return;
    setCurrentStreamUrl(url);
    c2paControllerRef.current?.reset();
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(url);
  }

  return { videoRef, c2paController, state, changeStream };
}
