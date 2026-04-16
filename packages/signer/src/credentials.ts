import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { logger } from './utils/logger.js';
import { createWriteStream } from 'fs';
import { config } from './config.js';
import { TEMP_DIR } from './constants.js';

const CERT_HASH_BYTE_LENGTH = 16;

let certPath: string;
let privateKeyPath: string;
let certHashB64: string;

async function fetchCredentialPath(source: string | undefined): Promise<string> {
  if (!source) {
    throw new Error('Credential source (path or URL) cannot be empty.');
  }

  if (source.startsWith('http')) {
    logger.info(`Downloading credential from URL: ${source}`);

    const urlObj = new URL(source);
    const ext = path.extname(urlObj.pathname) || '';
    const tempFileName = `cred_${crypto.randomUUID()}${ext}`;
    const tempPath = path.join(TEMP_DIR, tempFileName);
    const fileStream = createWriteStream(tempPath);
    const client = source.startsWith('https') ? https : http;

    await new Promise<void>((resolve, reject) => {
      client
        .get(source, (response) => {
          response.pipe(fileStream);
          fileStream.on('finish', () => resolve());
          fileStream.on('error', reject);
        })
        .on('error', reject);
    });

    logger.info(`Credential temporarily saved to: ${tempPath}`);
    return tempPath;
  }

  logger.info(`Using credential from local path: ${source}`);
  return source;
}

export async function initializeCredentials(): Promise<void> {
  try {
    logger.info('Initializing C2PA credentials...');
    certPath = await fetchCredentialPath(config.pubCert);
    privateKeyPath = await fetchCredentialPath(config.privKey);

    const certBuffer = await fs.readFile(certPath);
    const fullHash = crypto.createHash('sha256').update(certBuffer).digest();
    certHashB64 = fullHash.subarray(0, CERT_HASH_BYTE_LENGTH).toString('base64');
    logger.info('Credentials loaded and ready.');
  } catch (error) {
    logger.error('Fatal error initializing credentials. Application cannot continue.', error);
    process.exit(1);
  }
}

export function getCertPath(): string {
  if (!certPath) throw new Error('Credentials not initialized. Call initializeCredentials() first.');
  return certPath;
}

export function getPrivateKeyPath(): string {
  if (!privateKeyPath) throw new Error('Credentials not initialized. Call initializeCredentials() first.');
  return privateKeyPath;
}

export function getCertHash(): string {
  if (!certHashB64) throw new Error('Credentials not initialized. Call initializeCredentials() first.');
  return certHashB64;
}
