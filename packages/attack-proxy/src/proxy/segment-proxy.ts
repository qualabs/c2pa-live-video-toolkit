import http from 'http';
import { ORIGIN, CONTENT_CACHE_SIZE } from '../config.js';
import { extractMoofMdat } from '../mp4/mdat-utils.js';
import type { SessionState, SegmentInfo } from '../types.js';
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

export function parseSegmentFilename(filename: string): SegmentInfo | null {
  let m = filename.match(/chunk-stream(\d+)-(\d+)\.m4s$/);
  if (m) return { streamId: m[1], number: +m[2], pattern: 'chunk-stream' };

  m = filename.match(/segment-(\d+)\.m4s$/);
  if (m) return { streamId: '0', number: +m[1], pattern: 'segment' };

  m = filename.match(/(video|audio)_(\d+)_(\d+)\.m4s$/);
  if (m) return { streamId: m[2], number: +m[3], pattern: m[1] };

  return null;
}

export function cacheContent(session: SessionState, segNum: number, segmentBytes: Buffer): void {
  const content = extractMoofMdat(segmentBytes);
  if (!content) return;

  session.contentCache.set(segNum, {
    moof: Buffer.from(content.moof),
    mdat: Buffer.from(content.mdat),
    full: Buffer.from(segmentBytes),
  });

  if (session.contentCache.size > CONTENT_CACHE_SIZE) {
    session.contentCache.delete(session.contentCache.keys().next().value as number);
  }
}

export function fetchSegment(segNum: number, info: SegmentInfo): Promise<Buffer> {
  const targetPath = buildSegmentPath(info, segNum);
  return new Promise((resolve, reject) => {
    http
      .get(`${ORIGIN}${targetPath}`, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

export function proxySegment(
  req: IncomingMessage & { session?: SessionState },
  res: ServerResponse,
  targetPath: string,
  segmentNumber: number | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    http
      .get(`${ORIGIN}${targetPath}`, (originRes) => {
        if (originRes.statusCode !== 200) {
          res.writeHead(originRes.statusCode ?? 502, originRes.headers);
          originRes.pipe(res);
          return resolve();
        }
        const chunks: Buffer[] = [];
        originRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        originRes.on('end', () => {
          try {
            const segmentBytes = Buffer.concat(chunks);
            if (segmentNumber !== null && req.session) {
              cacheContent(req.session, segmentNumber, segmentBytes);
            }
            res.writeHead(originRes.statusCode ?? 200, {
              ...originRes.headers,
              'Content-Length': segmentBytes.length,
            });
            res.end(segmentBytes);
            resolve();
          } catch (err) {
            console.error('Segment processing error:', (err as Error).message);
            res.statusCode = 500;
            res.end('Internal Server Error');
            reject(err);
          }
        });
      })
      .on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.statusCode = 502;
        res.end('Bad Gateway');
        reject(err);
      });
  });
}
