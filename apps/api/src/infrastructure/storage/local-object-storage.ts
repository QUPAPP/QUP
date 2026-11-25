import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { assertStorageKey, type ObjectStorage, type StoredObject } from "./object-storage.js";

/** Owner-only: the API process reads them, nothing else on the host does. */
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
/** The content type is kept beside the bytes, as object storage keeps it as metadata. */
const TYPE_SUFFIX = ".type";

/**
 * Files in a private directory on the API host: development, tests, and a
 * single machine. In a container they are lost when it is replaced — the
 * startup log warns in production (STORAGE_DRIVER=s3 is the production choice).
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly driver = "local" as const;
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
    // wx: a key is written once; an existing file is never replaced.
    await writeFile(path, bytes, { mode: FILE_MODE, flag: "wx" });
    await writeFile(`${path}${TYPE_SUFFIX}`, contentType, { mode: FILE_MODE, flag: "wx" });
  }

  async get(key: string): Promise<StoredObject | null> {
    const path = this.pathOf(key);
    try {
      const [bytes, contentType] = await Promise.all([
        readFile(path),
        readFile(`${path}${TYPE_SUFFIX}`, "utf8"),
      ]);
      return { bytes: new Uint8Array(bytes), contentType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private pathOf(key: string): string {
    assertStorageKey(key);
    const path = resolve(this.root, key);
    // The key pattern already forbids it; checked again where the path is made.
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Storage key escapes the root.");
    return path;
  }
}
