import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import dashjs from 'dashjs';
import { C2paPlayerUI, initializeQualitySelector } from '@qualabs/c2pa-live-videojs-ui';
import 'video.js/dist/video-js.css';
import '@qualabs/c2pa-live-videojs-ui/styles';
import type {
  C2paPlayerInstance,
  VideoJsPlayer,
  QualitySelectorInstance,
} from '@qualabs/c2pa-live-videojs-ui';
import { attachC2pa, C2paEvent } from '@qualabs/c2pa-live-dashjs-plugin';
import type { C2paController } from '@qualabs/c2pa-live-dashjs-plugin';
import type { C2paPlayerState } from './useC2paPlayer.js';
import { resolveStreamUrl, SEEK_BACK_OFFSET_SECONDS } from './playerUtils.js';

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
  const qualitySelectorRef = useRef<QualitySelectorInstance | null>(null);
  // Capture the initial videoSrc so the mount effect is truly mount-only
  const initialVideoSrcRef = useRef(videoSrc);

  const currentQualityLabelRef = useRef<string>('—');
  const currentAudioQualityLabelRef = useRef<string>('—');
  const qualitiesInitializedRef = useRef(false);

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
        const quality =
          record.mediaType === 'video'
            ? currentQualityLabelRef.current
            : currentAudioQualityLabelRef.current;
        setState((prev) => ({
          ...prev,
          segments: [...prev.segments, { ...record, quality }],
        }));
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

      const qualitySelector = initializeQualitySelector(
        vjsPlayer as unknown as VideoJsPlayer,
        (index) => {
          if (index === 'auto') {
            dashPlayer.updateSettings({
              streaming: { abr: { autoSwitchBitrate: { video: true } } },
            });
          } else {
            dashPlayer.updateSettings({
              streaming: { abr: { autoSwitchBitrate: { video: false } } },
            });
            dashPlayer.setQualityFor('video', index);
          }
        },
      );
      qualitySelectorRef.current = qualitySelector;

      dashPlayer.on(dashjs.MediaPlayer.events.MANIFEST_LOADED, () => {
        const audioList = dashPlayer.getBitrateInfoListFor('audio') ?? [];
        if (audioList.length > 0 && currentAudioQualityLabelRef.current === '—') {
          const highestAudio = audioList[audioList.length - 1];
          const kbps = Math.round(highestAudio.bitrate / 1000);
          currentAudioQualityLabelRef.current = kbps > 0 ? `${kbps} kbps` : `audio 1`;
        }

        if (qualitiesInitializedRef.current) return;
        const bitrateList = dashPlayer.getBitrateInfoListFor('video') ?? [];
        const highestIndex = bitrateList.length - 1;
        if (highestIndex >= 0) {
          currentQualityLabelRef.current = `${bitrateList[highestIndex].height}p`;
        }
        if (bitrateList.length > 1) {
          qualitiesInitializedRef.current = true;
          dashPlayer.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: false } } },
          });
          dashPlayer.setQualityFor('video', highestIndex);
          qualitySelector.updateQualities(
            bitrateList.map((info, i) => ({ index: i, height: info.height })),
          );
        }
      });

      dashPlayer.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, (e: unknown) => {
        const { mediaType, newQuality } = e as { mediaType: string; newQuality: number };
        if (mediaType === 'video') {
          const info = dashPlayer.getBitrateInfoListFor('video')?.[newQuality];
          if (info?.height) currentQualityLabelRef.current = `${info.height}p`;
        } else if (mediaType === 'audio') {
          const list = dashPlayer.getBitrateInfoListFor('audio') ?? [];
          const info = list[newQuality];
          if (info?.bitrate)
            currentAudioQualityLabelRef.current = `${Math.round(info.bitrate / 1000)} kbps`;
        }
        controller.resetSequence();
      });

      dashPlayer.initialize(videoEl, streamUrl, true);
      setVideoJsReady(true);
    });

    return () => {
      qualitySelectorRef.current?.destroy();
      qualitySelectorRef.current = null;
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
    qualitiesInitializedRef.current = false;
    currentQualityLabelRef.current = '—';
    currentAudioQualityLabelRef.current = '—';
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(url);
  }

  return { containerRef, c2paController, state, changeStream };
}
