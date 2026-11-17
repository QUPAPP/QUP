import { Inject, Injectable } from "@nestjs/common";
import type { ChatReference } from "@qup/ai-gateway";

import type { ActorContext } from "../../../common/actor.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  AiNodeNotFound,
  KnowledgeContentEmpty,
  KnowledgeItemNotFound,
} from "../domain/ai.errors.js";
import { owningSkillId } from "../domain/assist-nodes.js";
import { chunkText, type KnowledgeKind, searchTerms } from "../domain/knowledge.js";
import { KNOWLEDGE_STORE, type KnowledgeItemView, type KnowledgeStore } from "../domain/ports.js";

/** Model questions a generated draft is shown: enough to set a style, few enough to stay cheap. */
const STYLE_EXAMPLES_MAX = 3;
/** Library passages the study chat sees per message. */
const CHAT_REFERENCES_MAX = 4;

export interface NewKnowledgeRequest {
  taxonomyVersionId: string;
  /** A skill or subskill of the version; a subskill files the entry under its skill. */
  nodeId: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string;
}

/**
 * The knowledge library (AI_INTEGRATION.md "Knowledge Library", "Retrieval"):
 * admins add model questions and reference texts per exam; question
 * generation and the study chat retrieve passages from it. Everything a
 * model is told about the platform's content comes from here, so admins
 * decide what the AI knows.
 */
@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(KNOWLEDGE_STORE) private readonly store: KnowledgeStore,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
  ) {}

  async add(request: NewKnowledgeRequest, actor: ActorContext): Promise<KnowledgeItemView> {
    const outline = await this.catalog.activeOutline(request.taxonomyVersionId);
    if (!outline) throw new AiNodeNotFound();
    const skillId = request.nodeId ? owningSkillId(outline, request.nodeId) : null;
    if (request.nodeId && !skillId) throw new AiNodeNotFound();
    const chunks = chunkText(request.content);
    if (chunks.length === 0) throw new KnowledgeContentEmpty();
    return this.store.add(
      {
        examId: outline.version.examId,
        skillId,
        kind: request.kind,
        title: request.title,
        content: request.content,
        chunks,
      },
      actor,
    );
  }

  list(filter: { examId: string | null; limit: number; offset: number }) {
    return this.store.list(filter);
  }

  async archive(id: string, actor: ActorContext): Promise<void> {
    if (!(await this.store.archive(id, actor))) throw new KnowledgeItemNotFound();
  }

  /**
   * Model questions for a new draft: those of the skill and closest to its
   * topic first, else the exam's newest, so an exam with a library always
   * gets a style to follow.
   */
  async styleExamples(examId: string, skillId: string | null, topic: string): Promise<string[]> {
    const passages = await this.store.search({
      examId,
      kinds: ["EXAMPLE"],
      skillId,
      terms: searchTerms(topic),
      limit: STYLE_EXAMPLES_MAX,
      fallbackToRecent: true,
    });
    return passages.map((passage) => passage.text);
  }

  /** Passages that match a student's message; none when nothing matches (no padding). */
  async chatReferences(examId: string, message: string): Promise<ChatReference[]> {
    const passages = await this.store.search({
      examId,
      kinds: ["REFERENCE", "EXAMPLE"],
      skillId: null,
      terms: searchTerms(message),
      limit: CHAT_REFERENCES_MAX,
      fallbackToRecent: false,
    });
    return passages.map((passage) => ({ title: passage.title, text: passage.text }));
  }
}
