import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import { assertStorageKey, type ObjectStorage, type StoredObject } from "./object-storage.js";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  /** Null for AWS itself; the provider's endpoint for R2, MinIO and the like. */
  endpoint: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const NOT_FOUND = 404;
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Any S3-compatible bucket, through AWS's own SDK (request signing is not
 * reimplemented here). The bucket stays private: files are read back through
 * the API, which checks who may see them, never through public bucket URLs.
 */
export class S3ObjectStorage implements ObjectStorage {
  readonly driver = "s3" as const;
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assertStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // A key is written once: refuse to replace an existing object.
        IfNoneMatch: "*",
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    assertStorageKey(key);
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      if (!object.Body) return null;
      return {
        bytes: await object.Body.transformToByteArray(),
        contentType: object.ContentType ?? DEFAULT_CONTENT_TYPE,
      };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }
}
