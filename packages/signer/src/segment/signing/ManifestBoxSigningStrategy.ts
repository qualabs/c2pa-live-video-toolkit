import path from 'path';
import fs from 'fs/promises';
import { signManifestSegment } from '../../c2pa/cli.js';
import { streamToBuffer } from '../../utils/stream.js';
import { config } from '../../config.js';
import { BaseSigningStrategy } from './BaseSigningStrategy.js';
import type { IStorage } from '../../services/storage/IStorage.js';
import type { SigningContext } from './ISigningStrategy.js';
import { TEMP_DIR, CURRENT_MANIFEST_PATH, REPRESENTATION_ID_PLACEHOLDER } from '../../constants.js';
import { logger } from '../../utils/logger.js';

export class ManifestBoxSigningStrategy extends BaseSigningStrategy {
  protected readonly methodName = 'ManifestBox';

  constructor(private readonly storage: IStorage) {
    super();
  }

  protected buildOutputDirPath(representationId: string): string {
    return `${TEMP_DIR}/signed_${representationId}`;
  }

  protected async resolveInitPath(context: SigningContext): Promise<string | undefined> {
    const { representationId, initPattern, isFirstSegment } = context;
    if (!isFirstSegment || !initPattern) return undefined;
    return this.resolveInitSegmentPath(representationId, initPattern);
  }

  protected async performSigning(
    context: SigningContext,
    outputDir: string,
    segmentBasename: string,
    initPath: string | undefined,
  ): Promise<void> {
    await signManifestSegment({
      segmentsDir: TEMP_DIR,
      segmentGlob: segmentBasename,
      outputDir,
      manifestPath: CURRENT_MANIFEST_PATH,
      initPath,
      previousSegmentPath: context.previousSegmentPath,
    });
  }

  private async resolveInitSegmentPath(representationId: string, initPattern: string): Promise<string> {
    const initKey = initPattern.replace(REPRESENTATION_ID_PLACEHOLDER, representationId);
    const initPath = `${TEMP_DIR}/${path.basename(initKey)}`;

    try {
      await fs.access(initPath);
      logger.info(`[${representationId}] Init segment cached at ${initPath}`);
    } catch {
      logger.info(`[${representationId}] Downloading init segment: ${initKey}`);
      const initStream = await this.storage.getObject(config.inputBucket, initKey);
      const initBuffer = await streamToBuffer(initStream);
      await fs.writeFile(initPath, initBuffer);
    }

    return initPath;
  }
}
