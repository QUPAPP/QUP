import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { count, desc, eq, ilike, inArray } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { RichContent } from "../domain/question-content.js";

const { questionPassages, questionVersions } = tables;

export interface Passage {
  id: string;
  title: string;
  content: RichContent;
  createdAt: Date;
}

export interface PassageListItem extends Passage {
  /** Question versions pointing at it, any status. */
  questionCount: number;
}

export interface PassageStore {
  create(input: {
    title: string;
    content: RichContent;
    createdBy: string | null;
  }): Promise<Passage>;
  find(passageId: string): Promise<Passage | null>;
  findMany(passageIds: readonly string[]): Promise<Map<string, Passage>>;
  list(filter: {
    search?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<{ items: PassageListItem[]; hasMore: boolean }>;
}

export const PASSAGE_STORE = Symbol("PASSAGE_STORE");

const columns = {
  id: questionPassages.id,
  title: questionPassages.title,
  content: questionPassages.content,
  createdAt: questionPassages.createdAt,
};

type Row = { id: string; title: string; content: unknown; createdAt: Date };
const toPassage = (row: Row): Passage => ({ ...row, content: row.content as RichContent });

/** `%` and `_` in a search are literal characters, not wildcards. */
const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

@Injectable()
export class DrizzlePassageStore implements PassageStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: { title: string; content: RichContent; createdBy: string | null }) {
    const [row] = await this.db.insert(questionPassages).values(input).returning(columns);
    if (!row) throw new Error("Passage insert returned no row.");
    return toPassage(row);
  }

  async find(passageId: string): Promise<Passage | null> {
    const [row] = await this.db
      .select(columns)
      .from(questionPassages)
      .where(eq(questionPassages.id, passageId))
      .limit(1);
    return row ? toPassage(row) : null;
  }

  async findMany(passageIds: readonly string[]): Promise<Map<string, Passage>> {
    if (passageIds.length === 0) return new Map();
    const rows = await this.db
      .select(columns)
      .from(questionPassages)
      .where(inArray(questionPassages.id, [...new Set(passageIds)]));
    return new Map(rows.map((row) => [row.id, toPassage(row)]));
  }

  async list(filter: { search?: string | undefined; limit: number; offset: number }) {
    const rows = await this.db
      .select({ ...columns, questionCount: count(questionVersions.id) })
      .from(questionPassages)
      .leftJoin(questionVersions, eq(questionVersions.passageId, questionPassages.id))
      .where(filter.search ? ilike(questionPassages.title, likePattern(filter.search)) : undefined)
      .groupBy(questionPassages.id)
      .orderBy(desc(questionPassages.createdAt), desc(questionPassages.id))
      .limit(filter.limit + 1)
      .offset(filter.offset);
    return {
      items: rows
        .slice(0, filter.limit)
        .map((row) => ({ ...toPassage(row), questionCount: row.questionCount })),
      hasMore: rows.length > filter.limit,
    };
  }
}
