// Dash.js-specific adapter.
export { attachC2pa } from './attachC2pa.js';
export type { DashjsPlayer } from './attachC2pa.js';

// Re-export the entire core public API so consumers don't need to import
// from two packages.
export * from '@c2pa-live-toolkit/c2pa-player-core';
