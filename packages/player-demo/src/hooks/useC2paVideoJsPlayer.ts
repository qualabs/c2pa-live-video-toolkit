import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import { MediaPlayer } from 'dashjs';
import type { MediaPlayerClass } from 'dashjs';
import { C2paPlayerUI, initializeQualitySelector } from '@qualabs/c2pa-live-videojs-ui';
import 'video.js/dist/video-js.css';
import '@qualabs/c2pa-live-videojs-ui/styles';
import type {
  C2paPlayerInstance,
  VideoJsPlayer,
  QualitySelectorInstance,
} from '@qualabs/c2pa-live-videojs-ui';
import { attachC2pa, C2paEvent, SegmentStatus } from '@qualabs/c2pa-live-dashjs-plugin';
import type { C2paController, DashjsPlayer } from '@qualabs/c2pa-live-dashjs-plugin';
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
  const dashPlayerRef = useRef<MediaPlayerClass | null>(null);
  const c2paControllerRef = useRef<C2paController | null>(null);
  const c2paUiRef = useRef<C2paPlayerInstance | null>(null);
  const qualitySelectorRef = useRef<QualitySelectorInstance | null>(null);
  // Capture the initial videoSrc so the mount effect is truly mount-only
  const initialVideoSrcRef = useRef(videoSrc);

  const periodIndexRef = useRef(0);
  const isInAdPeriodRef = useRef(false);

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
        const quality =
          record.mediaType === 'video'
            ? currentQualityLabelRef.current
            : currentAudioQualityLabelRef.current;
        setState((prev) => {
          const existingIndex = prev.segments.findIndex(
            (s) => s.mediaType === record.mediaType && s.segmentNumber === record.segmentNumber,
          );
          if (existingIndex !== -1) {
            if (prev.segments[existingIndex].status === record.status) return prev;
            const updated = [...prev.segments];
            updated[existingIndex] = {
              ...record,
              quality,
              _periodIndex: prev.segments[existingIndex]._periodIndex,
            };
            return { ...prev, segments: updated };
          }
          return {
            ...prev,
            segments: [...prev.segments, { ...record, quality, _periodIndex: periodIndex }],
          };
        });
      });

      controller.on(C2paEvent.INIT_PROCESSED, (event) => {
        periodIndexRef.current += 1;
        isInAdPeriodRef.current = event.noC2paData ?? false;
        setState((prev) => ({ ...prev, initData: event }));
      });

      dashPlayer.on('error', (e: unknown) => {
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
            dashPlayer.setRepresentationForTypeByIndex('video', index);
          }
        },
      );
      qualitySelectorRef.current = qualitySelector;

      dashPlayer.on('manifestLoaded', () => {
        const audioList = dashPlayer.getRepresentationsByType('audio') ?? [];
        if (audioList.length > 0 && currentAudioQualityLabelRef.current === '—') {
          const highestAudio = audioList[audioList.length - 1];
          const kbps = Math.round(highestAudio.bandwidth / 1000);
          currentAudioQualityLabelRef.current = kbps > 0 ? `${kbps} kbps` : `audio 1`;
        }

        if (qualitiesInitializedRef.current) return;
        const repList = dashPlayer.getRepresentationsByType('video') ?? [];
        const highestIndex = repList.length - 1;
        if (highestIndex >= 0) {
          currentQualityLabelRef.current = `${repList[highestIndex].height}p`;
        }
        if (repList.length > 1) {
          qualitiesInitializedRef.current = true;
          dashPlayer.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: false } } },
          });
          dashPlayer.setRepresentationForTypeByIndex('video', highestIndex);
          qualitySelector.updateQualities(
            repList.map((info, i) => ({ index: i, height: info.height })),
          );
        }
      });

      dashPlayer.on('qualityChangeRendered', (e: unknown) => {
        const { newRepresentation } = e as {
          newRepresentation: { height?: number; bandwidth?: number; mediaInfo?: { type?: string } };
        };
        const mediaType = newRepresentation?.mediaInfo?.type;
        if (mediaType === 'video') {
          if (newRepresentation?.height)
            currentQualityLabelRef.current = `${newRepresentation.height}p`;
        } else if (mediaType === 'audio') {
          if (newRepresentation?.bandwidth)
            currentAudioQualityLabelRef.current = `${Math.round(newRepresentation.bandwidth / 1000)} kbps`;
        }
        // Reset only the sequence state for the track that just switched, not for all tracks.
        // Clearing all state on an audio switch would wipe video sequence state and prevent
        // SEQUENCE_NUMBER_BELOW_MINIMUM / duplicate detection on replayed video segments.
        if (mediaType) controller.resetSequenceForType(mediaType);
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
    periodIndexRef.current = 0;
    isInAdPeriodRef.current = false;
    qualitiesInitializedRef.current = false;
    currentQualityLabelRef.current = '—';
    currentAudioQualityLabelRef.current = '—';
    setState({ segments: [], initData: null });
    dashPlayerRef.current.attachSource(url);
  }

  return { containerRef, c2paController, state, changeStream };
}
