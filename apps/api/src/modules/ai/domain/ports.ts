import type { AiRunRecord, AiRunStatus } from "@qup/ai-gateway";

import type { ActorContext } from "../../../common/actor.js";
import type { KnowledgeKind } from "./knowledge.js";

/** What is about to be kept of one run (AI_INTEGRATION.md "Observability"). */
export interface AiRunEntry extends AiRunRecord {
  requestedBy: string | null;
  /** What the run was about, e.g. `question_version`. */
  subjectType: string;
  subjectId: string;
  /** The validated output of a successful run; null otherwise. Never the prompt. */
  output: unknown;
}

export interface StoredAiRun extends Omit<AiRunEntry, "output"> {
  id: string;
  createdAt: Date;
}

export interface AiRunStore {
  record(entry: AiRunEntry): Promise<void>;
  /** Newest first, without outputs. */
  recent(page: {
    limit: number;
    offset: number;
  }): Promise<{ items: StoredAiRun[]; hasMore: boolean }>;
  /** Calls and tokens (input + output) recorded since the given time, every task and status. */
  usageSince(since: Date): Promise<{ runs: number; tokens: number }>;
  /** Runs per status since the given time; every status is present. */
  countsSince(since: Date): Promise<Record<AiRunStatus, number>>;
  /** The newest successful output of a task about a subject, asked by this person since a time. */
  latestOutput(query: {
    task: string;
    promptVersion: string;
    requestedBy: string;
    subjectType: string;
    subjectId: string;
    since: Date;
  }): Promise<unknown | null>;
  /** Runs of a task this person asked for since a time, whatever their end. */
  countByRequesterSince(task: string, requestedBy: string, since: Date): Promise<number>;
  /** Successful runs of a task this person ever asked for (free trial use). */
  countSucceededByRequester(task: string, requestedBy: string): Promise<number>;
}

export const AI_RUN_STORE = Symbol("AI_RUN_STORE");

/** A library entry as admins list it. */
export interface KnowledgeItemView {
  id: string;
  examId: string;
  skillId: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string;
  chunkCount: number;
  createdBy: string | null;
  createdAt: Date;
}

export interface NewKnowledgeItem {
  examId: string;
  skillId: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string;
  /** The content cut into passages, in order (domain/knowledge.ts). */
  chunks: string[];
}

/** One passage retrieval found, best first. */
export interface KnowledgePassage {
  itemId: string;
  title: string;
  kind: KnowledgeKind;
  text: string;
}

export interface KnowledgeQuery {
  examId: string;
  kinds: readonly KnowledgeKind[];
  /** Passages of this skill rank first; null means no preference. */
  skillId: string | null;
  /** Words to match (domain/knowledge.ts `searchTerms`); empty matches nothing. */
  terms: readonly string[];
  limit: number;
  /** When nothing matches, return the newest passages instead of none. */
  fallbackToRecent: boolean;
}

export interface KnowledgeStore {
  /** Saves the entry and its passages, audited, in one transaction. */
  add(item: NewKnowledgeItem, actor: ActorContext): Promise<KnowledgeItemView>;
  /** Live entries, newest first; of one exam when given. */
  list(filter: {
    examId: string | null;
    limit: number;
    offset: number;
  }): Promise<{ items: KnowledgeItemView[]; hasMore: boolean }>;
  /** False when there is no live entry with that id. */
  archive(id: string, actor: ActorContext): Promise<boolean>;
  search(query: KnowledgeQuery): Promise<KnowledgePassage[]>;
}

export const KNOWLEDGE_STORE = Symbol("KNOWLEDGE_STORE");

export type ChatRole = "STUDENT" | "ASSISTANT";

export interface ChatMessageView {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

export interface ChatStore {
  /** The latest `limit` messages of a conversation, oldest first. */
  history(studentId: string, examId: string, limit: number): Promise<ChatMessageView[]>;
  /** Appends turns in order, in one transaction. */
  append(
    studentId: string,
    examId: string,
    turns: { role: ChatRole; content: string }[],
  ): Promise<ChatMessageView[]>;
  clear(studentId: string, examId: string): Promise<void>;
}

export const CHAT_STORE = Symbol("CHAT_STORE");
