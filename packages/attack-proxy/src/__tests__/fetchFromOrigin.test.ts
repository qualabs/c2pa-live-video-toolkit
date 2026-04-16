import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { Readable } from 'stream';

vi.mock('../config.js', () => ({
  ORIGIN: 'http://test-origin:8081',
}));

import { fetchFromOrigin } from '../proxy/fetchFromOrigin.js';

function createMockResponse(statusCode: number, body: string): Readable & { statusCode: number; headers: Record<string, string> } {
  const readable = new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    },
  });
  return Object.assign(readable, {
    statusCode,
    headers: { 'content-type': 'video/iso4' },
  });
}

describe('fetchFromOrigin', () => {
  beforeEach(() => {
    vi.spyOn(http, 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns body and statusCode on success', async () => {
    const mockResponse = createMockResponse(200, 'segment-data');
    vi.mocked(http.get).mockImplementation((_url: string | URL, callback?: (res: http.IncomingMessage) => void) => {
      callback?.(mockResponse as unknown as http.IncomingMessage);
      return { on: vi.fn().mockReturnThis() } as unknown as http.ClientRequest;
    });

    const result = await fetchFromOrigin('/chunk-stream0-00001.m4s');

    expect(result.statusCode).toBe(200);
    expect(result.body.toString()).toBe('segment-data');
    expect(result.headers['content-type']).toBe('video/iso4');
  });

  it('returns non-200 status codes', async () => {
    const mockResponse = createMockResponse(404, 'not found');
    vi.mocked(http.get).mockImplementation((_url: string | URL, callback?: (res: http.IncomingMessage) => void) => {
      callback?.(mockResponse as unknown as http.IncomingMessage);
      return { on: vi.fn().mockReturnThis() } as unknown as http.ClientRequest;
    });

    const result = await fetchFromOrigin('/missing.m4s');

    expect(result.statusCode).toBe(404);
  });

  it('rejects when HTTP request errors', async () => {
    vi.mocked(http.get).mockImplementation((_url: string | URL, _callback?: (res: http.IncomingMessage) => void) => {
      const req = {
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('connection refused')), 0);
          }
          return req;
        }),
      };
      return req as unknown as http.ClientRequest;
    });

    await expect(fetchFromOrigin('/fail.m4s')).rejects.toThrow('connection refused');
  });
});
