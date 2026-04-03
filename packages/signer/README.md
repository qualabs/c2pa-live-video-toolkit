# @c2pa-live/signer

C2PA signing service for live DASH video streaming. Monitors a DASH manifest (MPD), downloads new segments, signs them with C2PA provenance data, and publishes the signed output.

## Features

- Real-time C2PA signing of DASH segments
- Two signing strategies: ManifestBox and VSI (Verifiable Segment Information)
- Automatic MPD polling and segment queue management
- Configurable cleanup of old processed segments

## Setup

```bash
npm install
npm run build
```

## Usage

```bash
# Development
npm run dev

# Production
npm start
```

## Environment Variables

See `.env.example` in the repository root for all available configuration options.

## Docker

```bash
docker build -t c2pa-signer .
docker run -p 8080:8080 --env-file .env c2pa-signer
```
