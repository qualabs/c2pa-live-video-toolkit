import { CONTENT_CACHE_SIZE } from '../config.js';
import { extractMoofMdat } from '../mp4/mdat-utils.js';
import { state } from '../state.js';
import { fetchFromOrigin } from './fetchFromOrigin.js';
import { logger, errorMessage } from '../utils/logger.js';
import type { SegmentInfo } from '../types.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function buildSegmentPath(info: SegmentInfo, number: number): string {
  const pad5 = (n: number) => String(n).padStart(5, '0');
  const pad6 = (n: number) => String(n).padStart(6, '0');
  switch (info.pattern) {
    case 'chunk-stream':
      return `/chunk-stream${info.streamId}-${pad5(number)}.m4s`;
    case 'segment':
      return `/segment-${pad6(number)}.m4s`;
    case 'video':
    case 'audio':
      return `/${info.pattern}_${info.streamId}_${number}.m4s`;
    default:
      return `/chunk-stream${info.streamId}-${pad5(number)}.m4s`;
  }
}

const CHUNK_STREAM_REGEX = /chunk-stream(\d+)-(\d+)\.m4s$/;
const SEGMENT_REGEX = /segment-(\d+)\.m4s$/;
const MEDIA_TRACK_REGEX = /(video|audio)_(\d+)_(\d+)\.m4s$/;

export function parseSegmentFilename(filename: string): SegmentInfo | null {
  let m = filename.match(CHUNK_STREAM_REGEX);
  if (m) return { streamId: m[1], number: +m[2], pattern: 'chunk-stream' };

  m = filename.match(SEGMENT_REGEX);
  if (m) return { streamId: '0', number: +m[1], pattern: 'segment' };

  m = filename.match(MEDIA_TRACK_REGEX);
  if (m) return { streamId: m[2], number: +m[3], pattern: m[1] };

  return null;
}

export function cacheContent(segNum: number, segmentBytes: Buffer): void {
  const content = extractMoofMdat(segmentBytes);
  if (!content) return;

  state.contentCache.set(segNum, {
    moof: Buffer.from(content.moof),
    mdat: Buffer.from(content.mdat),
    full: Buffer.from(segmentBytes),
  });

  if (state.contentCache.size > CONTENT_CACHE_SIZE) {
    state.contentCache.delete(state.contentCache.keys().next().value as number);
  }
}

export async function fetchSegment(segNum: number, info: SegmentInfo): Promise<Buffer> {
  const targetPath = buildSegmentPath(info, segNum);
  const response = await fetchFromOrigin(targetPath);
  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}`);
  }
  return response.body;
}

export async function proxySegment(
  _req: IncomingMessage,
  res: ServerResponse,
  targetPath: string,
  segmentNumber: number | null,
): Promise<void> {
  try {
    const response = await fetchFromOrigin(targetPath);

    if (response.statusCode !== 200) {
      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
      return;
    }

    if (segmentNumber !== null) {
      cacheContent(segmentNumber, response.body);
    }

    res.writeHead(response.statusCode, {
      ...response.headers,
      'Content-Length': response.body.length,
    });
    res.end(response.body);
  } catch (err) {
    logger.error('Proxy error:', errorMessage(err));
    res.statusCode = 502;
    res.end('Bad Gateway');
  }
}
