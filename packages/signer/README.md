# @qualabs/c2pa-live-signer

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

Copy `.env.example` to `.env` in the repository root before running with Docker Compose:

```bash
cp .env.example .env
```

See `.env.example` for all available configuration options.

## Certificates

The `sample-certs/` directory contains example certificates for local development and demo purposes only. **Do not use them in production.**

For production, provide your own certificates and update the volume mount in `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/certs:/app/certs:ro
```

The signer expects the following files inside the mounted directory:

| File | Variable | Purpose |
|---|---|---|
| `ps256.pub` | `PUB_CERT` | Public certificate (ManifestBox signing) |
| `ps256.pem` | `PRIV_KEY` | Private key (ManifestBox signing) |

## Manifests

The `sample-manifests/` directory contains example C2PA manifest templates for local development and demo purposes only.

For production, provide your own manifest files and update the volume mounts in `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/segment_manifest.json:/app/segment_manifest.json:ro
  - /path/to/your/segment_manifest_vsi.json:/app/segment_manifest_vsi.json:ro
```

| File | Method | Purpose |
|---|---|---|
| `segment_manifest.json` | ManifestBox (§19.3) | C2PA manifest template for per-segment signing |
| `segment_manifest_vsi.json` | VSI (§19.4) | C2PA manifest template for VSI signing |

## Docker

```bash
docker build -t c2pa-signer .
docker run -p 8080:8080 --env-file .env c2pa-signer
```
