import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type {
  ImportBatch,
  ImportBatchStatus,
  ImportItem,
  ImportItemStatus,
  ImportStore,
  ImportTotals,
  ItemPayload,
  ItemUpdate,
} from "../domain/ports.js";
import type { ImportMapping } from "../domain/row-normaliser.js";
import type { ImportFileType } from "../domain/tabular.js";

const { importBatches, importItems } = tables;

const batchColumns = {
  id: importBatches.id,
  uploadedBy: importBatches.uploadedBy,
  originalFilename: importBatches.originalFilename,
  detectedType: importBatches.detectedType,
  status: importBatches.status,
  headers: importBatches.headers,
  mapping: importBatches.columnMapping,
  taxonomyVersionId: importBatches.taxonomyVersionId,
  totals: importBatches.totals,
  createdAt: importBatches.createdAt,
  completedAt: importBatches.completedAt,
};

const itemColumns = {
  id: importItems.id,
  batchId: importItems.batchId,
  sourceLocator: importItems.sourceLocator,
  payload: importItems.normalizedPayload,
  errors: importItems.validationErrors,
  duplicateOfQuestionId: importItems.duplicateOfQuestionId,
  status: importItems.status,
  resultingQuestionVersionId: importItems.resultingQuestionVersionId,
  createdAt: importItems.createdAt,
};

type BatchSelect = typeof importBatches.$inferSelect;
type BatchRow = Pick<
  BatchSelect,
  | "id"
  | "uploadedBy"
  | "originalFilename"
  | "detectedType"
  | "status"
  | "headers"
  | "taxonomyVersionId"
  | "totals"
  | "createdAt"
  | "completedAt"
> & { mapping: BatchSelect["columnMapping"] };
type ItemSelect = typeof importItems.$inferSelect;
type ItemRow = Pick<
  ItemSelect,
  | "id"
  | "batchId"
  | "sourceLocator"
  | "duplicateOfQuestionId"
  | "status"
  | "resultingQuestionVersionId"
  | "createdAt"
> & { payload: ItemSelect["normalizedPayload"]; errors: ItemSelect["validationErrors"] };

/** Rows are inserted in chunks: one statement per thousand parameters is plenty. */
const INSERT_CHUNK = 200;
/** Items are created in row order; ties (same transaction time) fall back to their locator number. */
const rowOrder = [
  asc(importItems.createdAt),
  asc(sql`(substring(${importItems.sourceLocator} from '[0-9]+'))::int`),
];

@Injectable()
export class DrizzleImportStore implements ImportStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listBatches(page: { limit: number; offset: number }) {
    const rows = await this.db
      .select(batchColumns)
      .from(importBatches)
      .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    return { items: rows.slice(0, page.limit).map(toBatch), hasMore: rows.length > page.limit };
  }

  createBatch(input: Parameters<ImportStore["createBatch"]>[0]): Promise<ImportBatch> {
    return this.db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatches)
        .values({
          uploadedBy: input.uploadedBy,
          originalFilename: input.originalFilename,
          detectedType: input.detectedType,
          objectKey: input.objectKey,
          parserVersion: input.parserVersion,
          headers: input.headers,
          totals: input.totals,
        })
        .returning(batchColumns);
      if (!batch) throw new Error("Import batch insert returned no row.");
      for (let start = 0; start < input.rows.length; start += INSERT_CHUNK) {
        await tx.insert(importItems).values(
          input.rows.slice(start, start + INSERT_CHUNK).map((row) => ({
            batchId: batch.id,
            sourceLocator: row.locator,
            normalizedPayload: { raw: row.raw } satisfies ItemPayload,
            validationErrors: [],
          })),
        );
      }
      return toBatch(batch);
    });
  }

  async findBatch(batchId: string): Promise<ImportBatch | null> {
    const [row] = await this.db
      .select(batchColumns)
      .from(importBatches)
      .where(eq(importBatches.id, batchId));
    return row ? toBatch(row) : null;
  }

  async items(
    batchId: string,
    filter: { status?: ImportItemStatus; limit: number; offset: number },
  ) {
    const rows = await this.db
      .select(itemColumns)
      .from(importItems)
      .where(
        and(
          eq(importItems.batchId, batchId),
          filter.status ? eq(importItems.status, filter.status) : undefined,
        ),
      )
      .orderBy(...rowOrder)
      .limit(filter.limit + 1)
      .offset(filter.offset);
    return { items: rows.slice(0, filter.limit).map(toItem), hasMore: rows.length > filter.limit };
  }

  async allItems(batchId: string): Promise<ImportItem[]> {
    const rows = await this.db
      .select(itemColumns)
      .from(importItems)
      .where(eq(importItems.batchId, batchId))
      .orderBy(...rowOrder);
    return rows.map(toItem);
  }

  async findItem(itemId: string): Promise<ImportItem | null> {
    const [row] = await this.db
      .select(itemColumns)
      .from(importItems)
      .where(eq(importItems.id, itemId));
    return row ? toItem(row) : null;
  }

  saveProcessing(
    batchId: string,
    input: {
      mapping: ImportMapping;
      taxonomyVersionId: string;
      items: (ItemUpdate & { id: string })[];
    },
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const item of input.items) {
        await tx
          .update(importItems)
          .set({
            status: item.status,
            normalizedPayload: item.payload,
            validationErrors: item.errors,
            duplicateOfQuestionId: item.duplicateOfQuestionId,
          })
          .where(and(eq(importItems.id, item.id), eq(importItems.batchId, batchId)));
      }
      await tx
        .update(importBatches)
        .set({
          columnMapping: input.mapping,
          taxonomyVersionId: input.taxonomyVersionId,
          status: "READY_FOR_REVIEW",
        })
        .where(eq(importBatches.id, batchId));
    });
  }

  async updateItem(
    itemId: string,
    update: Omit<ItemUpdate, "duplicateOfQuestionId">,
  ): Promise<ImportItem> {
    const [row] = await this.db
      .update(importItems)
      .set({
        status: update.status,
        normalizedPayload: update.payload,
        validationErrors: update.errors,
      })
      .where(eq(importItems.id, itemId))
      .returning(itemColumns);
    if (!row) throw new Error(`Import item ${itemId} vanished.`);
    return toItem(row);
  }

  async claimForImport(itemId: string): Promise<boolean> {
    const claimed = await this.db
      .update(importItems)
      .set({ status: "IMPORTED" })
      .where(and(eq(importItems.id, itemId), eq(importItems.status, "VALID")))
      .returning({ id: importItems.id });
    return claimed.length === 1;
  }

  async recordImported(itemId: string, questionVersionId: string): Promise<void> {
    await this.db
      .update(importItems)
      .set({ resultingQuestionVersionId: questionVersionId })
      .where(eq(importItems.id, itemId));
  }

  async recordRejected(itemId: string, errors: string[]): Promise<void> {
    await this.db
      .update(importItems)
      .set({ status: "INVALID", validationErrors: errors })
      .where(eq(importItems.id, itemId));
  }

  async updateBatch(
    batchId: string,
    input: { status?: ImportBatchStatus; totals: ImportTotals; completed?: boolean },
  ): Promise<ImportBatch> {
    const [row] = await this.db
      .update(importBatches)
      .set({
        totals: input.totals,
        ...(input.status ? { status: input.status } : {}),
        ...(input.completed ? { completedAt: sql`now()` } : {}),
      })
      .where(eq(importBatches.id, batchId))
      .returning(batchColumns);
    if (!row) throw new Error(`Import batch ${batchId} vanished.`);
    return toBatch(row);
  }
}

function toBatch(row: BatchRow): ImportBatch {
  return {
    ...row,
    detectedType: row.detectedType as ImportFileType,
    headers: (row.headers as string[] | null) ?? [],
    mapping: (row.mapping as ImportMapping | null) ?? null,
    totals: (row.totals as ImportTotals | null) ?? null,
  };
}

function toItem(row: ItemRow): ImportItem {
  return {
    id: row.id,
    batchId: row.batchId,
    sourceLocator: row.sourceLocator ?? "",
    payload: (row.payload as ItemPayload | null) ?? { raw: {} },
    errors: (row.errors as string[] | null) ?? [],
    duplicateOfQuestionId: row.duplicateOfQuestionId,
    status: row.status,
    resultingQuestionVersionId: row.resultingQuestionVersionId,
  };
}
