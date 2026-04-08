export const PORT = parseInt(process.env.PORT ?? '8083', 10);
export const ORIGIN = process.env.STATIC_SERVER_URL ?? 'http://origin-server:8081';
export const MDAT_SWAP_SOURCE_FILE = 'chunk-stream-mhv0-00001.m4s';
export const MDAT_SWAP_SOURCE_PATH = `/app/sample-assets/${MDAT_SWAP_SOURCE_FILE}`;
export const CONTENT_CACHE_SIZE = 10;
