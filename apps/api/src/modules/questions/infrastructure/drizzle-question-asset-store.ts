import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { eq, inArray } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { PgErrorCode, pgErrorInfo } from "../../../infrastructure/database/postgres-errors.js";
import type { AssetKind } from "../domain/question-assets.js";

const { questionAssets } = tables;

export interface QuestionAsset {
  id: string;
  kind: AssetKind;
  contentType: string;
  byteSize: number;
  storageKey: string;
}

export interface QuestionAssetStore {
  /** Records an asset, or returns the one already recorded for the same bytes (same SHA-256). */
  record(asset: {
    kind: AssetKind;
    contentType: string;
    byteSize: number;
    sha256: string;
    storageKey: string;
    uploadedBy: string | null;
  }): Promise<{ asset: QuestionAsset; created: boolean }>;
  findBySha256(sha256: string): Promise<QuestionAsset | null>;
  find(assetId: string): Promise<QuestionAsset | null>;
  /** The kind of each id that exists; unknown ids are absent. */
  kindsOf(assetIds: readonly string[]): Promise<Map<string, AssetKind>>;
}

export const QUESTION_ASSET_STORE = Symbol("QUESTION_ASSET_STORE");

const columns = {
  id: questionAssets.id,
  kind: questionAssets.kind,
  contentType: questionAssets.contentType,
  byteSize: questionAssets.byteSize,
  storageKey: questionAssets.storageKey,
};

@Injectable()
export class DrizzleQuestionAssetStore implements QuestionAssetStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(asset: Parameters<QuestionAssetStore["record"]>[0]) {
    try {
      const [row] = await this.db.insert(questionAssets).values(asset).returning(columns);
      if (!row) throw new Error("Asset insert returned no row.");
      return { asset: row, created: true };
    } catch (error) {
      // Two uploads of the same file at once: the first one's row wins.
      const info = pgErrorInfo(error);
      if (
        info?.code === PgErrorCode.uniqueViolation &&
        info.constraint === "question_assets_sha256_unique"
      ) {
        const existing = await this.findBySha256(asset.sha256);
        if (existing) return { asset: existing, created: false };
      }
      throw error;
    }
  }

  async findBySha256(sha256: string): Promise<QuestionAsset | null> {
    const [row] = await this.db
      .select(columns)
      .from(questionAssets)
      .where(eq(questionAssets.sha256, sha256))
      .limit(1);
    return row ?? null;
  }

  async find(assetId: string): Promise<QuestionAsset | null> {
    const [row] = await this.db
      .select(columns)
      .from(questionAssets)
      .where(eq(questionAssets.id, assetId))
      .limit(1);
    return row ?? null;
  }

  async kindsOf(assetIds: readonly string[]): Promise<Map<string, AssetKind>> {
    if (assetIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: questionAssets.id, kind: questionAssets.kind })
      .from(questionAssets)
      .where(inArray(questionAssets.id, [...new Set(assetIds)]));
    return new Map(rows.map((row) => [row.id, row.kind]));
  }
}
