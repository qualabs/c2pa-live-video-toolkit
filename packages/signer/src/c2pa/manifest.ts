import fs from 'fs/promises';
import http from 'http';
import https from 'https';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getPrivateKeyPath, getCertPath } from '../credentials.js';

export interface C2paAction {
  action?: string;
  parameters?: Record<string, unknown>;
}

export interface C2paAssertionData {
  actions?: C2paAction[];
  [key: string]: unknown;
}

export interface C2paAssertion {
  label?: string;
  data?: C2paAssertionData;
}

export interface C2paManifest {
  assertions?: C2paAssertion[];
  private_key?: string;
  sign_cert?: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseManifest(text: string): C2paManifest {
  const parsed = JSON.parse(text) as unknown;
  if (!isObject(parsed)) {
    throw new Error('Manifest must be a JSON object');
  }

  const manifest = parsed as C2paManifest;
  if (manifest.assertions !== undefined && !Array.isArray(manifest.assertions)) {
    throw new Error('Manifest assertions must be an array');
  }

  return manifest;
}

export function injectStreamId(manifest: C2paManifest, streamId: string): void {
  const segment = manifest.assertions?.find((a) => a?.label === 'c2pa.livevideo.segment');
  if (segment?.data && isObject(segment.data)) {
    segment.data['streamId'] = streamId;
  }
}

async function loadManifestContent(
  ref?: string,
  useVsiMethod = false,
): Promise<{ text: string; source: string }> {
  if (!ref) {
    const defaultFile = useVsiMethod ? './segment_manifest_vsi.json' : './segment_manifest.json';
    const text = await fs.readFile(defaultFile, 'utf-8');
    return { text, source: `default file (${useVsiMethod ? 'VSI' : 'ManifestBox'})` };
  }

  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    const client = ref.startsWith('https://') ? https : http;
    const text = await new Promise<string>((resolve, reject) => {
      client
        .get(ref, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} when fetching ${ref}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        })
        .on('error', reject);
    });
    return { text, source: ref };
  }
  // Fallback
  const text = await fs.readFile('./segment_manifest.json', 'utf-8');
  return { text, source: 'default file (fallback)' };
}

export async function loadC2paManifest(targetPath: string): Promise<void> {
  const customUrl = config.remoteC2paManifest;
  const useVsiMethod = config.useVsiMethod;

  let manifestJson: C2paManifest;
  let sourceLabel = 'default file';

  try {
    const { text, source } = await loadManifestContent(customUrl, useVsiMethod);
    manifestJson = parseManifest(text);
    sourceLabel = source;
  } catch {
    const defaultFile = useVsiMethod ? './segment_manifest_vsi.json' : './segment_manifest.json';
    const fallback = await fs.readFile(defaultFile, 'utf-8');
    manifestJson = parseManifest(fallback);
    sourceLabel = 'default file (fallback)';
  }

  injectStreamId(manifestJson, config.streamId);
  manifestJson.private_key = getPrivateKeyPath();
  manifestJson.sign_cert = getCertPath();

  const updatedManifestContent = JSON.stringify(manifestJson, null, 2);
  await fs.writeFile(targetPath, updatedManifestContent);
  logger.debug(`[c2pa] manifest JSON: ${JSON.stringify(manifestJson)}`);
  logger.info(`C2PA manifest loaded from ${sourceLabel} → ${targetPath}`);
}
