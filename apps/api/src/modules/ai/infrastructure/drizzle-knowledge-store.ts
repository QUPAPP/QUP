import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { ActorContext } from "../../../common/actor.js";
import { AuditAction, writeAudit } from "../../../infrastructure/audit/audit-log.js";
import { DATABASE } from "../../../infrastructure/database/database.module.js";
import { anyOfQuery, type KnowledgeKind } from "../domain/knowledge.js";
import type {
  KnowledgeItemView,
  KnowledgePassage,
  KnowledgeQuery,
  KnowledgeStore,
  NewKnowledgeItem,
} from "../domain/ports.js";

const { aiKnowledgeItems: items, aiKnowledgeChunks: chunks } = tables;
const RESOURCE_TYPE = "ai_knowledge_item";
/** Ranks a passage of the asked-for skill above an equally relevant one of another. */
const SAME_SKILL_BOOST = 0.5;

const itemColumns = {
  id: items.id,
  examId: items.examId,
  skillId: items.skillId,
  kind: items.kind,
  title: items.title,
  content: items.content,
  createdBy: items.createdBy,
  createdAt: items.createdAt,
};

interface PassageRow extends Record<string, unknown> {
  item_id: string;
  title: string;
  kind: KnowledgeKind;
  content: string;
}

const passage = (row: PassageRow): KnowledgePassage => ({
  itemId: row.item_id,
  title: row.title,
  kind: row.kind,
  text: row.content,
});

@Injectable()
export class DrizzleKnowledgeStore implements KnowledgeStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  add(item: NewKnowledgeItem, actor: ActorContext): Promise<KnowledgeItemView> {
    return this.db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(items)
        .values({
          examId: item.examId,
          skillId: item.skillId,
          kind: item.kind,
          title: item.title,
          content: item.content,
          createdBy: actor.userId,
        })
        .returning(itemColumns);
      if (!saved) throw new Error("The knowledge item was not saved");
      await tx
        .insert(chunks)
        .values(item.chunks.map((content, position) => ({ itemId: saved.id, position, content })));
      await writeAudit(tx, actor, {
        action: AuditAction.KnowledgeItemAdded,
        resourceType: RESOURCE_TYPE,
        resourceId: saved.id,
        metadata: { examId: item.examId, kind: item.kind, chunks: item.chunks.length },
      });
      return { ...saved, chunkCount: item.chunks.length };
    });
  }

  async list(filter: { examId: string | null; limit: number; offset: number }) {
    const live = and(
      isNull(items.archivedAt),
      filter.examId ? eq(items.examId, filter.examId) : undefined,
    );
    const rows = await this.db
      .select(itemColumns)
      .from(items)
      .where(live)
      .orderBy(desc(items.createdAt), desc(items.id))
      .limit(filter.limit + 1)
      .offset(filter.offset);
    const page = rows.slice(0, filter.limit);
    const counts =
      page.length === 0
        ? []
        : await this.db
            .select({ itemId: chunks.itemId, n: count() })
            .from(chunks)
            .where(
              inArray(
                chunks.itemId,
                page.map((row) => row.id),
              ),
            )
            .groupBy(chunks.itemId);
    const byItem = new Map(counts.map((row) => [row.itemId, row.n]));
    return {
      items: page.map((row) => ({ ...row, chunkCount: byItem.get(row.id) ?? 0 })),
      hasMore: rows.length > filter.limit,
    };
  }

  archive(id: string, actor: ActorContext): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [archived] = await tx
        .update(items)
        .set({ archivedAt: new Date() })
        .where(and(eq(items.id, id), isNull(items.archivedAt)))
        .returning({ id: items.id, examId: items.examId });
      if (!archived) return false;
      await writeAudit(tx, actor, {
        action: AuditAction.KnowledgeItemArchived,
        resourceType: RESOURCE_TYPE,
        resourceId: id,
        metadata: { examId: archived.examId },
      });
      return true;
    });
  }

  async search(query: KnowledgeQuery): Promise<KnowledgePassage[]> {
    if (query.kinds.length === 0 || query.limit <= 0) return [];
    const kinds = sql.join(
      query.kinds.map((kind) => sql`${kind}::ai_knowledge_kind`),
      sql`, `,
    );
    const sameSkill = query.skillId
      ? sql`CASE WHEN i.skill_id = ${query.skillId}::uuid THEN ${SAME_SKILL_BOOST}::real ELSE 0 END`
      : sql`0::real`;

    if (query.terms.length > 0) {
      const matched = await this.db.execute<PassageRow>(sql`
        SELECT c.item_id, i.title, i.kind, c.content
        FROM ai_knowledge_chunks c
        JOIN ai_knowledge_items i ON i.id = c.item_id,
          websearch_to_tsquery('arabic', ${anyOfQuery(query.terms)}) AS q
        WHERE i.exam_id = ${query.examId}::uuid
          AND i.archived_at IS NULL
          AND i.kind IN (${kinds})
          AND c.search_vector @@ q
        ORDER BY ts_rank(c.search_vector, q) + ${sameSkill} DESC, c.id
        LIMIT ${query.limit}`);
      if (matched.length > 0 || !query.fallbackToRecent) return matched.map(passage);
    } else if (!query.fallbackToRecent) {
      return [];
    }

    const recent = await this.db.execute<PassageRow>(sql`
      SELECT c.item_id, i.title, i.kind, c.content
      FROM ai_knowledge_chunks c
      JOIN ai_knowledge_items i ON i.id = c.item_id
      WHERE i.exam_id = ${query.examId}::uuid
        AND i.archived_at IS NULL
        AND i.kind IN (${kinds})
      ORDER BY ${sameSkill} DESC, i.created_at DESC, c.position
      LIMIT ${query.limit}`);
    return recent.map(passage);
  }
}
