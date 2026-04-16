import http from 'http';
import { ORIGIN } from '../config.js';

export interface OriginResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export function fetchFromOrigin(path: string): Promise<OriginResponse> {
  return new Promise((resolve, reject) => {
    http
      .get(`${ORIGIN}${path}`, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      })
      .on('error', reject);
  });
}
