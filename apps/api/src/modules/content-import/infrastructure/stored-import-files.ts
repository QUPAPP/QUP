import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../../../infrastructure/storage/object-storage.js";
import type { ImportFileStorage } from "../domain/ports.js";

/** Import originals are opaque bytes to storage; their parsed rows live in the database. */
const ORIGINAL_CONTENT_TYPE = "application/octet-stream";
const AREA = "imports";

/**
 * Import originals in the platform's private storage (QUESTION_BANK_IMPORT.md
 * "private quarantine storage"): the bucket in production, a local directory
 * otherwise (infrastructure/storage). The key is a random UUID.
 */
@Injectable()
export class StoredImportFiles implements ImportFileStorage {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async save(bytes: Uint8Array): Promise<string> {
    const key = `${AREA}/${randomUUID()}`;
    await this.storage.put(key, bytes, ORIGINAL_CONTENT_TYPE);
    return key;
  }
}
