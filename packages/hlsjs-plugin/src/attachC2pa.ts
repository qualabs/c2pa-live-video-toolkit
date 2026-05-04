import {
  createC2paPipeline,
  type C2paController,
  type C2paOptions,
  type MediaSegmentInput,
  type MediaType,
} from '@qualabs/c2pa-live-player-core';

/**
 * Minimal structural interface for the hls.js player config fields this plugin
 * touches. No runtime dependency on hls.js types.
 *
 * The loader constructors are typed as `any` to avoid contravariant mismatch
 * between hls.js's full LoaderContext and our minimal HlsLoaderContext — we
 * cast to HlsLoaderConstructor internally where we need it.
 */
export interface HlsPlayer {
  config: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader: new (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fLoader?: new (...args: any[]) => any;
  };
}

type HlsLoaderContext = {
  frag: {
    sn: 'initSegment' | number;
    type: string;
    level: number;
  };
};

type HlsLoaderResponse = {
  data: ArrayBuffer | Uint8Array;
};

type HlsLoaderCallbacks = {
  onSuccess: (
    response: HlsLoaderResponse,
    stats: object,
    context: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
  onError: unknown;
  onTimeout: unknown;
};

interface HlsLoaderInstance {
  load(context: HlsLoaderContext, config: object, callbacks: HlsLoaderCallbacks): void;
  abort(): void;
  destroy(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HlsLoaderConstructor = new (...args: any[]) => HlsLoaderInstance;

function adaptHlsFragment(
  context: HlsLoaderContext,
  data: ArrayBuffer | Uint8Array,
  segmentIndex: number,
): MediaSegmentInput | null {
  const { sn, type, level } = context.frag;
  if (type === 'subtitle') return null;

  const kind = sn === 'initSegment' ? 'init' : 'media';
  const mediaType: MediaType = type === 'audio' ? 'audio' : 'video';
  const source = data instanceof Uint8Array ? data : new Uint8Array(data);

  return {
    kind,
    mediaType,
    bytes: new Uint8Array(source),
    segmentIndex,
    streamId: level,
  };
}

// Factory avoids TypeScript's restriction on extending a constructor variable
// directly in a class declaration. The generic `new (...args: any[])` bound is
// the standard TypeScript mixin pattern for this.
function buildInterceptLoader(
  Base: HlsLoaderConstructor,
  route: (input: MediaSegmentInput) => Promise<void>,
  counter: { value: number },
): HlsLoaderConstructor {
  class C2paInterceptLoader extends Base {
    load(context: HlsLoaderContext, config: object, callbacks: HlsLoaderCallbacks): void {
      const origOnSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
        counter.value += 1;
        const input = adaptHlsFragment(ctx, response.data, counter.value);
        if (input) route(input).catch(() => {});
        origOnSuccess(response, stats, ctx, networkDetails);
      };
      super.load(context, config, callbacks);
    }
  }
  return C2paInterceptLoader;
}

/**
 * Attaches C2PA validation to an hls.js player instance.
 *
 * Must be called BEFORE `hls.loadSource()` so the first init segment is
 * intercepted. Only works with CMAF HLS (fMP4/.m4s segments with #EXT-X-MAP).
 * Classic MPEG-TS segments will pass through unvalidated.
 *
 * @example
 * ```ts
 * const hls = new Hls();
 * const c2pa = attachC2pa(hls);
 * c2pa.on(C2paEvent.SEGMENT_VALIDATED, (record) => console.log(record.status));
 * hls.loadSource(url);
 * hls.attachMedia(videoElement);
 * ```
 */
export function attachC2pa(hls: HlsPlayer, options: C2paOptions = {}): C2paController {
  const originalFLoader = (hls.config.fLoader ?? hls.config.loader) as HlsLoaderConstructor;
  const counter = { value: 0 };

  const pipeline = createC2paPipeline({
    ...options,
    onDetach: () => {
      hls.config.fLoader = originalFLoader as HlsPlayer['config']['fLoader'];
    },
  });

  hls.config.fLoader = buildInterceptLoader(
    originalFLoader,
    pipeline.route,
    counter,
  ) as HlsPlayer['config']['fLoader'];

  return pipeline.controller;
}
