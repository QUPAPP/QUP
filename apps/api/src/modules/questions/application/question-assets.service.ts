import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from "../../../infrastructure/storage/object-storage.js";
import { type AssetKind, maxBytesFor, sniffAsset } from "../domain/question-assets.js";
import { AssetNotFound, AssetTooLarge, AssetTypeNotAccepted } from "../domain/questions.errors.js";
import {
  QUESTION_ASSET_STORE,
  type QuestionAsset,
  type QuestionAssetStore,
} from "../infrastructure/drizzle-question-asset-store.js";

const STORAGE_AREA = "question-assets";

/**
 * Uploading and reading the images and audio of questions. The bytes go to
 * private storage first, then the row: a row never points at nothing. The same
 * file uploaded twice is one asset (SHA-256), so a retried upload is harmless.
 */
@Injectable()
export class QuestionAssetsService {
  constructor(
    @Inject(QUESTION_ASSET_STORE) private readonly assets: QuestionAssetStore,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(
    bytes: Uint8Array,
    actor: ActorContext,
  ): Promise<{ asset: QuestionAsset; created: boolean }> {
    const sniffed = sniffAsset(bytes);
    if (!sniffed) throw new AssetTypeNotAccepted();
    const limit = maxBytesFor(sniffed.kind);
    if (bytes.byteLength > limit) throw new AssetTooLarge(sniffed.kind, limit);

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await this.assets.findBySha256(sha256);
    if (existing) return { asset: existing, created: false };

    const storageKey = `${STORAGE_AREA}/${randomUUID()}`;
    await this.storage.put(storageKey, bytes, sniffed.contentType);
    return this.assets.record({
      kind: sniffed.kind,
      contentType: sniffed.contentType,
      byteSize: bytes.byteLength,
      sha256,
      storageKey,
      uploadedBy: actor.userId,
    });
  }

  /** The asset and its bytes; AssetNotFound when either is missing. */
  async read(assetId: string): Promise<{ asset: QuestionAsset; object: StoredObject }> {
    const asset = await this.assets.find(assetId);
    if (!asset) throw new AssetNotFound();
    const object = await this.storage.get(asset.storageKey);
    if (!object) throw new AssetNotFound();
    // The type recorded from the bytes at upload, whatever the storage says now.
    return { asset, object: { bytes: object.bytes, contentType: asset.contentType } };
  }

  kindsOf(assetIds: readonly string[]): Promise<Map<string, AssetKind>> {
    return this.assets.kindsOf(assetIds);
  }
}
