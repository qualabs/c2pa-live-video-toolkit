export interface IStorage {
  /**
   * Saves an object (file) to the specified bucket.
   * @param bucket The name of the bucket.
   * @param key The path/name of the file within the bucket.
   * @param body The file content as a Buffer.
   * @param acl (Optional) The access control list for the object.
   * @param mimeType (Optional) The MIME type of the object.
   */
  saveObject(bucket: string, key: string, body: Buffer, acl?: string, mimeType?: string): Promise<void>;

  /**
   * Gets an object as a readable stream.
   * @param bucket The name of the bucket.
   * @param key The path/name of the file within the bucket.
   * @returns A promise that resolves with a readable stream (NodeJS.ReadableStream).
   */
  getObject(bucket: string, key: string): Promise<NodeJS.ReadableStream>;

  /**
   * Gets the content of an object as a string.
   * Useful for files like .mpd or .json.
   * @param bucket The name of the bucket.
   * @param key The path/name of the file within the bucket.
   * @returns A promise that resolves with the file content as a string.
   */
  getObjectAsString(bucket: string, key: string): Promise<string>;

  /**
   * Checks if an object exists without downloading it.
   * Useful for polling for segments.
   * @param bucket The name of the bucket.
   * @param key The path/name of the file within the bucket.
   * @returns Resolves if the object exists, rejects if not.
   */
  headObject(bucket: string, key: string): Promise<void>;
  /**
   * Checks if an object exists in the bucket.
   * @param bucket The name of the bucket.
   * @param key The path/name of the file within the bucket.
   * @returns A promise that resolves to true if the object exists, false otherwise.
   */
  objectExists(bucket: string, key: string): Promise<boolean>;
}
