import { randomBytes } from 'crypto';
import fs from 'fs/promises';

const ED25519_SEED_BYTE_LENGTH = 32;

/**
 * Generates a 32-byte Ed25519 seed for use as a VSI session key.
 *
 * The seed is written as raw binary. c2patool derives the Ed25519 key pair
 * from this seed when signing with --method vsi --session-key <path>.
 *
 * @param sessionKeyPath - Destination path for the raw 32-byte seed file.
 */
export async function generateSessionKey(sessionKeyPath: string): Promise<void> {
  await fs.writeFile(sessionKeyPath, randomBytes(ED25519_SEED_BYTE_LENGTH));
}
