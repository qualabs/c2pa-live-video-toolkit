import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PROXY_PORT = process.env.VITE_PROXY_PORT ?? '8083';
const ORIGIN_PORT = process.env.VITE_ORIGIN_PORT ?? '3000';
const PROXY_TARGET = `http://localhost:${PROXY_PORT}`;
const ORIGIN_TARGET = `http://localhost:${ORIGIN_PORT}`;

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['dashjs'],
  },
  server: {
    port: 3008,
    proxy: {
      // Local toolkit endpoints — only hit when the user types a local URL into the input.
      // The default demo points to live.unified-streaming.com and bypasses these entirely.
      '/manifest': { target: ORIGIN_TARGET, changeOrigin: true },
      '/stream.mpd': { target: PROXY_TARGET, changeOrigin: true },
      '/init-stream': { target: PROXY_TARGET, changeOrigin: true },
      '/chunk-stream': { target: PROXY_TARGET, changeOrigin: true },
    },
  },
});
