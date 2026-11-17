import { Inject, Injectable } from "@nestjs/common";
import { type Database, tables } from "@qup/db";
import { and, desc, eq } from "drizzle-orm";

import { DATABASE } from "../../../infrastructure/database/database.module.js";
import type { ChatMessageView, ChatRole, ChatStore } from "../domain/ports.js";

const { aiChatMessages: messages } = tables;

const columns = {
  id: messages.id,
  role: messages.role,
  content: messages.content,
  createdAt: messages.createdAt,
};

/** Keeps a reply after its question even when both land in the same millisecond. */
const TURN_GAP_MS = 1;

@Injectable()
export class DrizzleChatStore implements ChatStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async history(studentId: string, examId: string, limit: number): Promise<ChatMessageView[]> {
    const rows = await this.db
      .select(columns)
      .from(messages)
      .where(and(eq(messages.studentId, studentId), eq(messages.examId, examId)))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit);
    return rows.reverse();
  }

  async append(
    studentId: string,
    examId: string,
    turns: { role: ChatRole; content: string }[],
  ): Promise<ChatMessageView[]> {
    if (turns.length === 0) return [];
    const now = Date.now();
    return this.db
      .insert(messages)
      .values(
        turns.map((turn, index) => ({
          studentId,
          examId,
          role: turn.role,
          content: turn.content,
          createdAt: new Date(now + index * TURN_GAP_MS),
        })),
      )
      .returning(columns);
  }

  async clear(studentId: string, examId: string): Promise<void> {
    await this.db
      .delete(messages)
      .where(and(eq(messages.studentId, studentId), eq(messages.examId, examId)));
  }
}
