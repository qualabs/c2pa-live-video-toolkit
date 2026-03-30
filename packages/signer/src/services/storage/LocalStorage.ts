import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { IStorage } from './IStorage.js';

export class LocalStorage implements IStorage {
  async saveObject(bucket: string, key: string, body: Buffer): Promise<void> {
    const fullPath = path.resolve(bucket, key);
    const dir = path.dirname(fullPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(fullPath, body);
  }

  async getObject(bucket: string, key: string): Promise<NodeJS.ReadableStream> {
    const fullPath = path.resolve(bucket, key);
    return fs.createReadStream(fullPath);
  }

  async getObjectAsString(bucket: string, key: string): Promise<string> {
    const fullPath = path.resolve(bucket, key);
    return await fsp.readFile(fullPath, 'utf-8');
  }

  async headObject(bucket: string, key: string): Promise<void> {
    const fullPath = path.resolve(bucket, key);
    await fsp.access(fullPath, fs.constants.R_OK);
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    const fullPath = path.resolve(bucket, key);
    try {
      await fsp.access(fullPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
