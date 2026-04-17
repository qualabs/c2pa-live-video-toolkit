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
