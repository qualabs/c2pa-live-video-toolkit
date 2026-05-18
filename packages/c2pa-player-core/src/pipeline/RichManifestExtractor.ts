import { validateC2paManifestBoxSegment } from '@svta/cml-c2pa';
import type { AugmentedC2paManifest, CertInfo, Logger } from '../types.js';
import { parseX509Names } from '../utils/x509.js';
import { extractCawgCertNames } from '../utils/cawgCert.js';

const CAWG_IDENTITY_LABEL = 'cawg.identity';

/**
 * Pulls a "rich" C2PA manifest from a media segment's manifest box. Used in hybrid
 * VSI+ManifestBox streams (e.g. Unified Streaming with CAWG identity) where the init
 * segment only carries the minimal created_assertions, while each media segment also
 * embeds the full manifest with referenced assertions like cawg.identity / cawg.metadata.
 *
 * Validation errors are ignored — we only care about extracting the manifest content.
 */
export class RichManifestExtractor {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async extract(
    bytes: Uint8Array,
    previousCertInfo: CertInfo | null,
  ): Promise<AugmentedC2paManifest | null> {
    try {
      const { result } = await validateC2paManifestBoxSegment(bytes, null);
      if (!result.manifest) return null;
      const certificate = (result as { certificate?: Uint8Array }).certificate;
      const cawgIdentity = result.manifest.assertions.find((a) => a.label === CAWG_IDENTITY_LABEL);
      const cawgCertInfo = cawgIdentity ? extractCawgCertNames(cawgIdentity.data) : null;
      const augmented: AugmentedC2paManifest = {
        ...result.manifest,
        certInfo: certificate ? parseX509Names(certificate) : previousCertInfo,
        cawgCertInfo,
      };
      return augmented;
    } catch (error) {
      this.logger.warn('[RichManifestExtractor] Failed to extract per-segment manifest:', error);
      return null;
    }
  }
}
