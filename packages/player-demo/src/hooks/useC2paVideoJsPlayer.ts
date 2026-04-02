import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import dashjs from 'dashjs';
import { C2paPlayerUI } from '@c2pa-live-toolkit/videojs-c2pa-ui';
import 'video.js/dist/video-js.css';
import '@c2pa-live-toolkit/videojs-c2pa-ui/styles';
import type { C2paPlayerInstance } from '@c2pa-live-toolkit/videojs-c2pa-ui';
import { attachC2pa } from '@c2pa-live-toolkit/dashjs-c2pa-plugin';
import type { C2paController } from '@c2pa-live-toolkit/dashjs-c2pa-plugin';
import type { C2paPlayerState } from './useC2paPlayer.js';
import { resolveStreamUrl, buildRequestModifier, SEEK_BACK_OFFSET_SECONDS } from './playerUtils.js';

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
  const unsubscribeSegmentsRef = useRef<(() => void) | null>(null);

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
      const streamUrl = resolveStreamUrl(videoSrc);

      const dashPlayer = dashjs.MediaPlayer().create();
      dashPlayerRef.current = dashPlayer;

      dashPlayer.extend('RequestModifier', buildRequestModifier(), true);

      // DashjsPlayer (local interface in attachC2pa.ts) is structurally compatible
      // with dashjs.MediaPlayerClass but not assignable due to narrow extend() signature
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controller = attachC2pa(dashPlayer as any);
      c2paControllerRef.current = controller;
      setC2paController(controller);

      unsubscribeSegmentsRef.current = controller.subscribeToSegments((segments) => {
        setState((prev) => ({ ...prev, segments }));
      });

      controller.on('initProcessed', (event) => {
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
      unsubscribeSegmentsRef.current?.();
      unsubscribeSegmentsRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = videoJsPlayerRef.current;
    if (!player || !c2paController || !videoJsReady) return;

    c2paUiRef.current?.destroy();
    // video.js Player type is compatible but not directly assignable to the ui package's expected type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c2paUiRef.current = C2paPlayerUI(player as any, c2paController);

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
