import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import dashjs from 'dashjs';
import { C2paPlayerUI } from '@c2pa-live-toolkit/videojs-ui';
import 'video.js/dist/video-js.css';
import '@c2pa-live-toolkit/videojs-ui/styles';
import type { C2paPlayerInstance, VideoJsPlayer } from '@c2pa-live-toolkit/videojs-ui';
import { attachC2pa, C2paEvent } from '@c2pa-live-toolkit/dashjs-plugin';
import type { C2paController } from '@c2pa-live-toolkit/dashjs-plugin';
import type { C2paPlayerState } from './useC2paPlayer.js';
import {
  buildMissingSegmentRecords,
  resolveStreamUrl,
  SEEK_BACK_OFFSET_SECONDS,
} from './playerUtils.js';

const VIDEO_JS_OPTIONS = {
  autoplay: true,
  controls: true,
  fluid: true,
  controlBar: {
    children: ['playToggle', 'currentTimeDisplay', 'progressControl', 'fullscreenToggle'],
  },
};

export type UseC2paVideoJsPlayerResult = {
  /** Attach to a <div> — the <video> is created programmatically inside the effect */
  containerRef: React.RefObject<HTMLDivElement>;
  c2paController: C2paController | null;
  state: C2paPlayerState;
  changeStream: (url: string) => void;
  videoJsReady: boolean;
};

/**
 * Initializes video.js + dash.js + C2PA without React controlling the <video> element.
 *
 * The <video> element is created imperatively inside the effect and appended to
 * a container div (containerRef). This prevents React's reconciler from removing
 * or conflicting with the DOM changes video.js makes when it wraps the element.
 *
 * Initialization order:
 *   1. Create <video> element and append to container
 *   2. video.js wraps it with its player UI
 *   3. Inside player.ready(), dash.js attaches to the same <video>
 *   4. attachC2pa() is called before dashPlayer.initialize()
 */
export function useC2paVideoJsPlayer(videoSrc?: string): UseC2paVideoJsPlayerResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoJsPlayerRef = useRef<ReturnType<typeof videojs> | null>(null);
  const dashPlayerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const c2paControllerRef = useRef<C2paController | null>(null);
  const c2paUiRef = useRef<C2paPlayerInstance | null>(null);
  // Capture the initial videoSrc so the mount effect is truly mount-only
  const initialVideoSrcRef = useRef(videoSrc);

  const [c2paController, setC2paController] = useState<C2paController | null>(null);
  const [state, setState] = useState<C2paPlayerState>({ segments: [], initData: null });
  const [videoJsReady, setVideoJsReady] = useState(false);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    // Create <video> imperatively so React never manages it.
    // If video.js moves it in the DOM, React won't notice or interfere.
    const videoEl = document.createElement('video');
    videoEl.className = 'video-js';
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    containerEl.appendChild(videoEl);

    const vjsPlayer = videojs(videoEl, VIDEO_JS_OPTIONS);
    videoJsPlayerRef.current = vjsPlayer;

    vjsPlayer.ready(() => {
      const streamUrl = resolveStreamUrl(initialVideoSrcRef.current);

      const dashPlayer = dashjs.MediaPlayer().create();
      dashPlayerRef.current = dashPlayer;

      const controller = attachC2pa(dashPlayer);
      c2paControllerRef.current = controller;
      setC2paController(controller);

      controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
        setState((prev) => {
          const missingRecords = buildMissingSegmentRecords(record, prev.segments);
          return { ...prev, segments: [...prev.segments, record, ...missingRecords] };
        });
      });

      controller.on(C2paEvent.INIT_PROCESSED, (event) => {
        setState((prev) => ({ ...prev, initData: event }));
      });

      dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e: unknown) => {
        const event = e as { error?: unknown };
        console.warn('[player-demo] dash.js error:', event.error);
        const ranges = videoEl.buffered;
        if (ranges.length) {
          videoEl.currentTime = ranges.end(ranges.length - 1) - SEEK_BACK_OFFSET_SECONDS;
        }
      });

      dashPlayer.initialize(videoEl, streamUrl, true);
      setVideoJsReady(true);
    });

    return () => {
      c2paUiRef.current?.destroy();
      c2paUiRef.current = null;
      c2paControllerRef.current?.detach();
      c2paControllerRef.current = null;
      dashPlayerRef.current?.reset();
      dashPlayerRef.current = null;
      vjsPlayer.dispose(); // also removes videoEl from DOM
      videoJsPlayerRef.current = null;
      setVideoJsReady(false);
    };
  }, []);

  useEffect(() => {
    const player = videoJsPlayerRef.current;
    if (!player || !c2paController || !videoJsReady) return;

    c2paUiRef.current?.destroy();
    c2paUiRef.current = C2paPlayerUI(player as unknown as VideoJsPlayer, c2paController);

    return () => {
      c2paUiRef.current?.destroy();
      c2paUiRef.current = null;
    };
  }, [c2paController, videoJsReady]);

  function changeStream(url: string): void {
    if (!dashPlayerRef.current) return;
    c2paControllerRef.current?.reset();
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(url);
  }

  return { containerRef, c2paController, state, changeStream, videoJsReady };
}
