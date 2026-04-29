# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

C2PA Live Video Toolkit — open-source tools for embedding and verifying C2PA provenance in live CMAF-based DASH/HLS video streams. Turbo monorepo with 8 packages under `packages/`.

## Commands

```bash
npm install                  # Install all workspaces
npm run build                # Build all packages (turbo)
npm run dev                  # Dev mode — persistent, no cache
npm run lint                 # Lint all packages
npm run typecheck            # Type-check all packages
npm run format               # Format all packages

# Single package
npx turbo build --filter=@qualabs/c2pa-live-signer
npx turbo build --filter=@qualabs/c2pa-live-dashjs-plugin

# Tests (c2pa-player-core, dashjs-plugin, hls-plugin, and videojs-ui have tests)
cd packages/c2pa-player-core && npm run test    # Vitest, run once — generic pipeline
cd packages/dashjs-plugin && npm run test       # Vitest, run once — dash.js adapter
cd packages/dashjs-plugin && npm run test:watch # Vitest, watch mode
cd packages/hlsjs-plugin && npm run test        # Vitest, run once — hls.js adapter
cd packages/videojs-ui && npm run test

# Docker — full pipeline
docker compose up --build
# Services: signer:8080, origin-server:8082, manifest-server:3000, attack-proxy:8083

# Player demo (local dev)
cd packages/player-demo && npm run dev   # Vite on port 3008, proxies to 8083 and 3000
```

## Architecture

```
streamer (FFmpeg) → signer (C2PA signing) → origin-server (static) → attack-proxy (proxy/attacks)
                                                    ↑
                                            manifest-server (Python, dynamic MPDs)

Players consume from attack-proxy at http://localhost:8083/stream_with_ad.mpd
```

### Packages

| Package | Scope | Role |
|---|---|---|
| `signer` | `@qualabs/c2pa-live-signer` | Polls MPD, signs segments with c2patool, writes output |
| `origin-server` | `@qualabs/c2pa-live-origin-server` | Express static file server for signed segments |
| `streamer` | `@qualabs/c2pa-live-streamer` | FFmpeg scripts (no build step) |
| `attack-proxy` | `@qualabs/c2pa-live-attack-proxy` | DASH proxy with 4 attack types + manifest-server (dynamic MPDs with ad insertion) |
| `c2pa-player-core` | `@qualabs/c2pa-live-player-core` | **Internal** (not published). Player-agnostic C2PA validation engine — inlined into each player plugin's bundle at build time |
| `dashjs-plugin` | `@qualabs/c2pa-live-dashjs-plugin` | Dash.js adapter on top of the core. Converts `DashjsChunk` → generic `MediaSegmentInput` and delegates validation |
| `hlsjs-plugin` | `@qualabs/c2pa-live-hlsjs-plugin` | hls.js adapter on top of the core. Custom `fLoader` intercepts CMAF segments (init + media) and delegates validation |
| `videojs-ui` | `@qualabs/c2pa-live-videojs-ui` | Video.js UI components (progress bar, credentials menu, friction modal) |
| `player-demo` | `@qualabs/c2pa-live-player-demo` | React/Vite demo app (private), three modes: dashjs-native, videojs-enhanced, hls-native |

### Key dependencies

- `c2pa-player-core` depends on [`@svta/cml-c2pa`](https://www.npmjs.com/package/@svta/cml-c2pa) — the SVTA Common Media Library C2PA validator.
- `dashjs-plugin` and `hlsjs-plugin` both bundle `c2pa-player-core` via `tsup` (`noExternal`) and re-declare `@svta/cml-c2pa` as a real `dependency` so consumers get it transitively. The core is marked `private: true` and never published.
- `hlsjs-plugin` uses a custom `fLoader` (fragment loader class) to intercept both init and media segments uniformly — `FRAG_LOADED` events are not used as they don't fire for init segments.

### Signing methods

- **ManifestBox** (default, `USE_VSI_METHOD=false`): Full C2PA manifest embedded per segment.
- **VSI** (`USE_VSI_METHOD=true`): Lightweight COSE_Sign1 in emsg box; session keys in init segment.

### Signer design patterns

- **Strategy pattern**: `ISigningStrategy` with `ManifestBoxSigningStrategy` and `VsiSigningStrategy`
- **Repository pattern**: `SegmentRepository` for data access
- **Storage abstraction**: `IStorage` interface with `LocalStorage` / `GcsStorage` implementations
- Config via environment variables, loaded in `packages/signer/src/config.ts`

## Code Style

- TypeScript strict mode, target ES2020
- ESLint + Prettier enforced (prettier errors are ESLint errors)
- Prettier: 100 char width, single quotes, trailing commas, semicolons
- All packages are ES modules (`"type": "module"`)
- Turbo handles task orchestration and caching — always use `npx turbo` or root npm scripts

## Docker

All Dockerfiles use **monorepo root as build context**. Five services share a `stream-data` volume for segment exchange. The signer runs on `debian:sid` (needs c2patool binary); other Node services use `node:22-alpine`. The attack-proxy mounts Docker socket to restart the streamer container.

## Environment

Copy `.env.example` to `.env` before running. See `.env.example` for the full list. Key ones:

- `STORAGE_PROVIDER`: `LOCAL` (default) or `GCS`
- `USE_VSI_METHOD`: `false` (ManifestBox) or `true` (VSI)
- `C2PATOOL_PATH`: path to c2patool binary (default: `/usr/local/bin/c2patool`)
- `DEBUG`: verbose logging in signer
