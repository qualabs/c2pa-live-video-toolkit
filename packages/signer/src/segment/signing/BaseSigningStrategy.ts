import path from 'path';
import fs from 'fs/promises';
import type { ISigningStrategy, SigningContext, SigningResult } from './ISigningStrategy.js';
import { logger } from '../../utils/logger.js';

/**
 * Template Method base for signing strategies.
 * Defines the common algorithm skeleton (mkdir, log, build result),
 * delegating the variable steps to subclasses.
 */
export abstract class BaseSigningStrategy implements ISigningStrategy {
  protected abstract readonly methodName: string;

  protected abstract buildOutputDirPath(representationId: string): string;

  protected abstract resolveInitPath(context: SigningContext): Promise<string | undefined>;

  protected abstract performSigning(
    context: SigningContext,
    outputDir: string,
    segmentBasename: string,
    initPath: string | undefined,
  ): Promise<void>;

  async sign(context: SigningContext): Promise<SigningResult> {
    const { representationId, filePath, isFirstSegment } = context;

    const outputDir = this.buildOutputDirPath(representationId);
    await fs.mkdir(outputDir, { recursive: true });

    const segmentBasename = path.basename(filePath);
    const initPath = await this.resolveInitPath(context);

    this.logSigningStart(representationId, isFirstSegment);
    await this.performSigning(context, outputDir, segmentBasename, initPath);

    return this.buildSigningResult(outputDir, segmentBasename, initPath, isFirstSegment);
  }

  private logSigningStart(representationId: string, isFirstSegment: boolean): void {
    const phase = isFirstSegment ? '[first segment, including init]...' : '[chained from prev segment]...';
    logger.info(`[${representationId}] Signing with ${this.methodName} method ${phase}`);
  }

  private buildSigningResult(
    outputDir: string,
    segmentBasename: string,
    initPath: string | undefined,
    isFirstSegment: boolean,
  ): SigningResult {
    return {
      signedSegmentPath: path.join(outputDir, segmentBasename),
      signedInitPath: isFirstSegment && initPath ? path.join(outputDir, path.basename(initPath)) : undefined,
    };
  }
}
