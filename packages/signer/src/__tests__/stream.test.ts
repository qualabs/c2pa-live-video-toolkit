import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { streamToBuffer } from '../utils/stream.js';

function createReadableFromChunks(chunks: Buffer[]): NodeJS.ReadableStream {
  let index = 0;
  return new Readable({
    read() {
      if (index < chunks.length) {
        this.push(chunks[index++]);
      } else {
        this.push(null);
      }
    },
  });
}

describe('streamToBuffer', () => {
  it('collects a single chunk into a buffer', async () => {
    const stream = createReadableFromChunks([Buffer.from('hello')]);
    const result = await streamToBuffer(stream);
    expect(result.toString()).toBe('hello');
  });

  it('concatenates multiple chunks', async () => {
    const stream = createReadableFromChunks([
      Buffer.from('foo'),
      Buffer.from('bar'),
      Buffer.from('baz'),
    ]);
    const result = await streamToBuffer(stream);
    expect(result.toString()).toBe('foobarbaz');
  });

  it('returns an empty buffer for an empty stream', async () => {
    const stream = createReadableFromChunks([]);
    const result = await streamToBuffer(stream);
    expect(result.length).toBe(0);
  });

  it('rejects when the stream emits an error', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('stream broke'));
      },
    });
    await expect(streamToBuffer(stream)).rejects.toThrow('stream broke');
  });
});
