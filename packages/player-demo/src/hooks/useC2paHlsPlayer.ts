import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { attachC2pa, C2paEvent } from '@qualabs/c2pa-live-hlsjs-plugin';
import type {
  C2paController,
  InitProcessedEvent,
} from '@qualabs/c2pa-live-hlsjs-plugin';
import { resolveStreamUrl, SEEK_BACK_OFFSET_SECONDS } from './playerUtils.js';
import type { TaggedSegmentRecord, C2paPlayerState } from './useC2paPlayer.js';
import { DEFAULT_HLS_STREAM_URL } from '../constants.js';

export type UseC2paHlsPlayerResult = {
  videoRef: React.RefObject<HTMLVideoElement>;
  c2paController: C2paController | null;
  state: C2paPlayerState;
  changeStream: (url: string) => void;
};

function resolveHlsStreamUrl(videoSrc?: string): string {
  if (videoSrc) return videoSrc;
  const urlParam = new URLSearchParams(window.location.search).get('url');
  return urlParam ?? DEFAULT_HLS_STREAM_URL;
}

/**
 * Configures an hls.js player with C2PA validation via attachC2pa().
 * State shape mirrors useC2paPlayer so both hooks are interchangeable in demo views.
 *
 * attachC2pa() must be called before hls.loadSource() — this hook ensures that.
 * Falls back to native HLS (no C2PA) when hls.js is not supported (Safari).
 */
export function useC2paHlsPlayer(videoSrc?: string): UseC2paHlsPlayerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const c2paControllerRef = useRef<C2paController | null>(null);
  const isInitializedRef = useRef(false);
  const initialVideoSrcRef = useRef(videoSrc);

  const [c2paController, setC2paController] = useState<C2paController | null>(null);
  const [state, setState] = useState<C2paPlayerState>({ segments: [], initData: null });
  const [currentStreamUrl, setCurrentStreamUrl] = useState(() => resolveHlsStreamUrl(videoSrc));

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const streamUrl = resolveHlsStreamUrl(initialVideoSrcRef.current);
    setCurrentStreamUrl(streamUrl);

    const videoEl = videoRef.current!;

    if (!Hls.isSupported()) {
      // Safari uses its native HLS engine — bytes don't flow through hls.js,
      // so C2PA validation is unavailable in this mode.
      videoEl.src = streamUrl;
      return;
    }

    const hls = new Hls();
    hlsRef.current = hls;

    const controller = attachC2pa(hls);
    c2paControllerRef.current = controller;
    setC2paController(controller);

    controller.on(C2paEvent.SEGMENT_VALIDATED, (record) => {
      const tagged: TaggedSegmentRecord = { ...record, _periodIndex: 0 };
      setState((prev) => ({ ...prev, segments: [...prev.segments, tagged] }));
    });

    controller.on(C2paEvent.INIT_PROCESSED, (event) => {
      setState((prev) => ({ ...prev, initData: event }));
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        const ranges = videoEl.buffered;
        if (ranges.length) {
          videoEl.currentTime = ranges.end(ranges.length - 1) - SEEK_BACK_OFFSET_SECONDS;
        }
      }
    });

    hls.loadSource(streamUrl);
    hls.attachMedia(videoEl);

    return () => {
      controller.detach();
      hls.destroy();
      hlsRef.current = null;
      c2paControllerRef.current = null;
      isInitializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hlsRef.current || !isInitializedRef.current) return;
    if (!videoSrc || videoSrc === currentStreamUrl) return;
    setCurrentStreamUrl(videoSrc);
    c2paControllerRef.current?.reset();
    setState({ segments: [], initData: null });
    hlsRef.current.loadSource(videoSrc);
  }, [videoSrc, currentStreamUrl]);

  function changeStream(url: string): void {
    if (!hlsRef.current) return;
    setCurrentStreamUrl(url);
    c2paControllerRef.current?.reset();
    setState({ segments: [], initData: null });
    hlsRef.current.loadSource(url);
  }

  return { videoRef, c2paController, state, changeStream };
}

export { resolveStreamUrl };
