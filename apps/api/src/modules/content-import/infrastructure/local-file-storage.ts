import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import type { ImportFileStorage } from "../domain/ports.js";

/** Owner-only: the API process reads them, nothing else on the host does. */
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * V1 storage for import originals: a private directory on the API host
 * (IMPORT_STORAGE_DIR). Keys are random UUIDs, so a filename can never steer
 * where bytes land. Object storage replaces this adapter in production
 * (OPEN_QUESTIONS.md #16g).
 */
@Injectable()
export class LocalImportFileStorage implements ImportFileStorage {
  private readonly directory: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.directory = resolve(config.imports.storageDir);
  }

  async save(bytes: Uint8Array): Promise<string> {
    await mkdir(this.directory, { recursive: true, mode: DIRECTORY_MODE });
    const key = randomUUID();
    await writeFile(resolve(this.directory, key), bytes, { mode: FILE_MODE, flag: "wx" });
    return key;
  }
}
