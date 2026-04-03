import { IStorage } from './IStorage.js';
import { LocalStorage } from './LocalStorage.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_STORAGE_PROVIDER = 'LOCAL';

export function createStorage(): IStorage {
  const provider = (process.env.STORAGE_PROVIDER || DEFAULT_STORAGE_PROVIDER).toUpperCase();

  logger.info(`Initializing storage provider: ${provider}`);

  switch (provider) {
    case 'LOCAL':
      return new LocalStorage();
    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
}
