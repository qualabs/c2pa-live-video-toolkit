import path from 'path';
import { signVsiSegment } from '../../c2pa/cli.js';
import { BaseSigningStrategy } from './BaseSigningStrategy.js';
import type { SigningContext } from './ISigningStrategy.js';
import { TEMP_DIR, CURRENT_MANIFEST_PATH, REPRESENTATION_ID_PLACEHOLDER } from '../../constants.js';

export class VsiSigningStrategy extends BaseSigningStrategy {
  protected readonly methodName = 'VSI';

  protected buildOutputDirPath(representationId: string): string {
    return `${TEMP_DIR}/signed_vsi_${representationId}`;
  }

  protected async resolveInitPath(context: SigningContext): Promise<string> {
    const { representationId, initPattern } = context;
    if (!initPattern) {
      throw new Error(`Could not find init pattern for ${representationId}`);
    }
    const initKey = initPattern.replace(REPRESENTATION_ID_PLACEHOLDER, representationId);
    return `${TEMP_DIR}/${path.basename(initKey)}`;
  }

  protected async performSigning(
    context: SigningContext,
    outputDir: string,
    segmentBasename: string,
    initPath: string | undefined,
  ): Promise<void> {
    const { representationId, previousSegmentPath } = context;
    const sessionKeyPath = `${TEMP_DIR}/session_key_init-stream${representationId}.pem`;

    await signVsiSegment({
      segmentsDir: TEMP_DIR,
      segmentGlob: segmentBasename,
      outputDir,
      manifestPath: CURRENT_MANIFEST_PATH,
      sessionKeyPath,
      initPath: initPath!,
      previousSegmentPath,
    });
  }
}
