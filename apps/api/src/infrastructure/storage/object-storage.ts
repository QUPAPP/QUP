/**
 * Private file storage (ARCHITECTURE.md "S3-compatible storage"): import
 * originals and the images and audio of questions. Keys are built by the
 * platform from random ids, never from a caller's filename or path, so no
 * request can steer where bytes land or which file is read.
 */
export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface ObjectStorage {
  /** Which adapter: shown in logs and the startup warning. */
  readonly driver: "local" | "s3";
  /** Writes the bytes under the key. A key is written once; callers never overwrite. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The object, or null when there is none under the key. */
  get(key: string): Promise<StoredObject | null>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

/** Keys are `<area>/<uuid>`: two fixed segments the platform chose. */
const KEY_PATTERN = /^[a-z][a-z-]{0,30}\/[0-9a-f-]{36}$/;

/** Fails fast on a key the platform could not have built (defence in depth against traversal). */
export function assertStorageKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error(`Refusing storage key ${JSON.stringify(key)}.`);
}
