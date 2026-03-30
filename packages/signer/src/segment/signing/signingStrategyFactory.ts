import { createStorage } from '../../services/storage/storageFactory.js';
import { VsiSigningStrategy } from './VsiSigningStrategy.js';
import { ManifestBoxSigningStrategy } from './ManifestBoxSigningStrategy.js';
import type { ISigningStrategy } from './ISigningStrategy.js';

export function createSigningStrategy(useVsiMethod: boolean): ISigningStrategy {
  if (useVsiMethod) {
    return new VsiSigningStrategy();
  }
  return new ManifestBoxSigningStrategy(createStorage());
}
