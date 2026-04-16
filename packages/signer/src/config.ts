import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PUBLISH_MANIFEST_INTERVAL_MS = 4000;
const DEFAULT_PROCESS_INTERVAL_MS = 500;
const DEFAULT_HEALTH_PORT = 8080;
const DEFAULT_CLEANUP_MAX_AGE_MINUTES = 30;
const DEFAULT_CLEANUP_INTERVAL_MS = 60000;
const DEFAULT_C2PATOOL_PATH = '/usr/local/bin/c2patool';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  inputBucket: requireEnv('INPUT_BUCKET'),
  mpdKey: requireEnv('MPD_KEY'),
  outputBucket: requireEnv('OUTPUT_BUCKET'),
  publishManifestIntervalMs: parseInt(
    process.env.PUBLISH_MANIFEST_INTERVAL_MS || String(DEFAULT_PUBLISH_MANIFEST_INTERVAL_MS),
    10,
  ),
  processIntervalMs: parseInt(
    process.env.PROCESS_INTERVAL_MS || String(DEFAULT_PROCESS_INTERVAL_MS),
    10,
  ),
  debug: process.env.DEBUG === 'true',
  pubCert: process.env.PUB_CERT,
  privKey: process.env.PRIV_KEY,
  healthPort: parseInt(process.env.HEALTH_PORT || String(DEFAULT_HEALTH_PORT), 10),
  remoteC2paManifest: process.env.REMOTE_C2PA_MANIFEST,
  cleanupMaxAgeMinutes: parseInt(
    process.env.CLEANUP_MAX_AGE_MINUTES || String(DEFAULT_CLEANUP_MAX_AGE_MINUTES),
    10,
  ),
  cleanupIntervalMs: parseInt(
    process.env.CLEANUP_INTERVAL_MS || String(DEFAULT_CLEANUP_INTERVAL_MS),
    10,
  ),
  useVsiMethod: process.env.USE_VSI_METHOD === 'true',
  vsiSessionKeyPath: process.env.SESSION_KEY_PATH || '/app/certs/session.pem',
  streamId: process.env.STREAM_ID || 'live',
  c2patoolPath: process.env.C2PATOOL_PATH || DEFAULT_C2PATOOL_PATH,
};

if (config.debug) {
  console.log('DEBUG MODE ENABLED');
  console.log('Configuration:', config);
  console.log(`Signing method: ${config.useVsiMethod ? 'VSI' : 'ManifestBox'}`);
}
