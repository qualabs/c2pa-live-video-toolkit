import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Options for signing a media segment using the per-segment ManifestBox method (§19.3)
 * with `c2patool live-video-sign`.
 */
export interface ManifestSignOptions {
  /** Base directory where the segment file lives (used as <path> by c2patool). */
  segmentsDir: string;
  /** Filename (or glob) of the segment to sign, resolved relative to segmentsDir. */
  segmentGlob: string;
  /** Directory where c2patool writes the signed output files. */
  outputDir: string;
  /** Path to the manifest definition JSON file. */
  manifestPath: string;
  /**
   * Absolute path to the init segment.
   * Pass only on the first segment of a new session to sign the init alongside the media segment.
   */
  initPath?: string;
  /**
   * Absolute path to the last signed media segment from the previous call.
   * Pass from the second segment onwards to resume the continuity chain.
   */
  previousSegmentPath?: string;
}

/**
 * Options for signing a media segment using the Verifiable Segment Info method (§19.4)
 * with `c2patool live-video-sign --method vsi`.
 */
export interface VsiSignOptions {
  /** Base directory where the segment file lives. */
  segmentsDir: string;
  /** Filename (or glob) of the segment to sign, resolved relative to segmentsDir. */
  segmentGlob: string;
  /** Directory where c2patool writes the signed output files. */
  outputDir: string;
  /** Path to the manifest definition JSON file. */
  manifestPath: string;
  /** Path to the raw 32-byte Ed25519 session key seed file. */
  sessionKeyPath: string;
  /**
   * Absolute path to the init segment.
   * Required on every call — c2patool --method vsi always needs the init segment.
   */
  initPath: string;
  /**
   * Absolute path to the last signed media segment from the previous call.
   * Pass from the second segment onwards to resume the sequence number chain.
   */
  previousSegmentPath?: string;
}

async function executeC2paToolCommand(
  command: string,
  label: string,
  startTime: number,
): Promise<void> {
  const { stdout, stderr } = await execAsync(command);

  logger.debug(`[${label}] stdout: ${stdout.trim()}`);

  if (stderr) {
    logger.info(`[${label}] stderr: ${stderr.trim()}`);
  }

  const duration = Date.now() - startTime;
  logger.info(`[${label}] Signed in ${duration}ms`);
}

/**
 * Signs a media segment (and optionally the init segment) using `c2patool live-video-sign`
 * with the per-segment ManifestBox method (§19.3).
 *
 * Chain continuity is maintained automatically via `--previous-segment` instead of
 * capturing `MANIFEST_ID` from stdout as the legacy binary required.
 */
export async function signManifestSegment(options: ManifestSignOptions): Promise<void> {
  const { segmentsDir, segmentGlob, outputDir, manifestPath, initPath, previousSegmentPath } =
    options;
  const startTime = Date.now();

  const args: string[] = [
    `"${segmentsDir}"`,
    'live-video-sign',
    '--segments_glob',
    `"${segmentGlob}"`,
    '--output',
    `"${outputDir}"`,
    '--manifest',
    `"${manifestPath}"`,
  ];

  if (initPath) {
    args.push('--init', `"${initPath}"`);
  }

  if (previousSegmentPath) {
    args.push('--previous-segment', `"${previousSegmentPath}"`);
  }

  const command = `${config.c2patoolPath} ${args.join(' ')}`;

  logger.debug(`[ManifestBox] Command: ${command}`);

  await executeC2paToolCommand(command, 'ManifestBox', startTime);
}

/**
 * Signs a media segment (and optionally the init segment) using `c2patool live-video-sign`
 * with the Verifiable Segment Info method (§19.4).
 *
 * The init segment is required on the first call and carries the `c2pa.session-keys`
 * assertion. Subsequent calls use `--previous-segment` to resume the sequence counter.
 */
export async function signVsiSegment(options: VsiSignOptions): Promise<void> {
  const {
    segmentsDir,
    segmentGlob,
    outputDir,
    manifestPath,
    sessionKeyPath,
    initPath,
    previousSegmentPath,
  } = options;
  const startTime = Date.now();

  const args: string[] = [
    `"${segmentsDir}"`,
    'live-video-sign',
    '--segments_glob',
    `"${segmentGlob}"`,
    '--output',
    `"${outputDir}"`,
    '--manifest',
    `"${manifestPath}"`,
    '--method',
    'vsi',
    '--session-key',
    `"${sessionKeyPath}"`,
    '--init',
    `"${initPath}"`,
  ];

  if (previousSegmentPath) {
    args.push('--previous-segment', `"${previousSegmentPath}"`);
  }

  const command = `${config.c2patoolPath} ${args.join(' ')}`;

  logger.debug(`[VSI] Command: ${command}`);

  await executeC2paToolCommand(command, 'VSI', startTime);
}
