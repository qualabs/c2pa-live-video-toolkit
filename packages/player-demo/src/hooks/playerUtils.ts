import { PROXY_BASE, getProxySessionId } from '../state/attackState.js';
import { DEFAULT_STREAM_URL } from '../constants.js';

/**
 * How many seconds to seek back from the end of the buffer when recovering
 * from a dash.js error (e.g. gap attack). Keeps playback within a valid range.
 */
export const SEEK_BACK_OFFSET_SECONDS = 0.05;

export function resolveStreamUrl(videoSrc?: string): string {
  if (videoSrc) return videoSrc;
  const urlParam = new URLSearchParams(window.location.search).get('url');
  return urlParam ?? DEFAULT_STREAM_URL;
}

/**
 * Returns a dash.js RequestModifier factory that injects the X-Session-Id header
 * on all requests destined for the attack proxy or the current origin.
 * This ensures each browser tab gets isolated attack state from the proxy server.
 */
export function buildRequestModifier() {
  return function () {
    return {
      modifyRequestURL: (url: string) => url,
      modifyRequestHeader: (
        request: { setRequestHeader?: (h: string, v: string) => void },
        urlInfo?: { url?: string },
      ) => {
        const isProxiedRequest =
          request.setRequestHeader &&
          (urlInfo?.url?.startsWith(PROXY_BASE) ||
            urlInfo?.url?.startsWith(window.location.origin));

        if (isProxiedRequest) {
          request.setRequestHeader!('X-Session-Id', getProxySessionId());
        }
        return request;
      },
    };
  };
}
