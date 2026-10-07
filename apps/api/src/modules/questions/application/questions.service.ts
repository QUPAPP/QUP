import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/actor.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import { publishabilityProblems, structuralProblems } from "../domain/content-rules.js";
import {
  QUESTION_STORE,
  type QuestionListFilter,
  type QuestionListItem,
  type QuestionStore,
  type QuestionSummary,
  type QuestionVersionDetail,
  type ReviewDecision,
} from "../domain/ports.js";
import type { DraftContent } from "../domain/question-content.js";
import {
  InvalidQuestionTransition,
  QuestionArchived,
  QuestionContentInvalid,
  QuestionNotFound,
  QuestionVersionNotFound,
  TaxonomyNotPublished,
} from "../domain/questions.errors.js";

const STABLE_CODE_RANDOM_BYTES = 6;

/**
 * Question bank workflow (WORKFLOWS.md §7, PRD §10–11):
 *
 *   create draft → edit → submit for review → review (approve / send back)
 *   → publish (ADMIN) → … → archive
 *   published edit: new version draft → review → publish (previous archived)
 *
 * Each step checks the version's status to give a clear error; the database
 * enforces the same lifecycle (migration 0007) as the backstop.
 */
@Injectable()
export class QuestionsService {
  constructor(
    @Inject(QUESTION_STORE) private readonly store: QuestionStore,
    @Inject(CATALOG_LOOKUP) private readonly taxonomy: CatalogLookup,
  ) {}

  async create(
    input: { stableCode: string | undefined; content: DraftContent },
    actor: ActorContext,
  ): Promise<QuestionVersionDetail> {
    await this.assertValidDraft(input.content);
    return this.store.createQuestion(
      { stableCode: input.stableCode ?? generateStableCode(), createdBy: actor.userId },
      input.content,
    );
  }

  list(filter: QuestionListFilter): Promise<{ items: QuestionListItem[]; total: number }> {
    return this.store.listQuestions(filter);
  }

  async get(questionId: string): Promise<QuestionSummary> {
    const question = await this.store.findQuestion(questionId);
    if (!question) throw new QuestionNotFound();
    return question;
  }

  async getVersion(versionId: string): Promise<QuestionVersionDetail> {
    const version = await this.store.findVersion(versionId);
    if (!version) throw new QuestionVersionNotFound();
    return version;
  }

  /** Starts the next version as a DRAFT copy of the newest one (WORKFLOWS.md §7). */
  async createNextVersion(questionId: string, actor: ActorContext): Promise<QuestionVersionDetail> {
    const question = await this.get(questionId);
    if (question.archivedAt) throw new QuestionArchived();
    const newest = question.versions[0];
    if (!newest) throw new QuestionNotFound();
    return this.store.createNextVersion(questionId, await this.getVersion(newest.id), actor.userId);
  }

  async updateDraft(versionId: string, content: DraftContent): Promise<QuestionVersionDetail> {
    const version = await this.getVersion(versionId);
    if (version.status !== "DRAFT") throw new InvalidQuestionTransition("edit", version.status);
    await this.assertValidDraft(content);
    await this.store.replaceDraftContent(versionId, content);
    return this.getVersion(versionId);
  }

  async submitForReview(versionId: string): Promise<void> {
    const version = await this.getVersion(versionId);
    if (version.status !== "DRAFT") {
      throw new InvalidQuestionTransition("submit for review", version.status);
    }
    assertPublishable(version);
    await this.store.transition(versionId, "DRAFT", "UNDER_REVIEW");
  }

  /**
   * APPROVED moves the version on; REJECTED and CHANGES_REQUESTED send it back
   * to DRAFT. The decision is recorded either way (content_reviews).
   */
  async review(
    versionId: string,
    decision: ReviewDecision,
    notes: string | null,
    actor: ActorContext,
  ): Promise<void> {
    const version = await this.getVersion(versionId);
    if (version.status !== "UNDER_REVIEW") {
      throw new InvalidQuestionTransition("review", version.status);
    }
    await this.store.recordReview(
      versionId,
      { reviewerId: actor.userId, decision, notes },
      decision === "APPROVED" ? "APPROVED" : "DRAFT",
    );
  }

  async publish(versionId: string, actor: ActorContext): Promise<void> {
    const version = await this.getVersion(versionId);
    if (version.status !== "APPROVED") {
      throw new InvalidQuestionTransition("publish", version.status);
    }
    const question = await this.get(version.questionId);
    if (question.archivedAt) throw new QuestionArchived();

    assertPublishable(version);
    if ((await this.taxonomy.versionStatus(version.taxonomyVersionId)) !== "PUBLISHED") {
      throw new TaxonomyNotPublished();
    }
    await this.store.publish(version, actor);
  }

  async archive(questionId: string, actor: ActorContext): Promise<void> {
    const question = await this.get(questionId);
    if (question.archivedAt) return; // already archived: idempotent
    await this.store.archiveQuestion(questionId, actor);
  }

  /** Rules that hold for any saved draft: structure, and mappings into the right taxonomy. */
  private async assertValidDraft(content: DraftContent): Promise<void> {
    const problems = structuralProblems(content).map((message) => ({ path: "", message }));

    const status = await this.taxonomy.versionStatus(content.taxonomyVersionId);
    if (status === null) {
      problems.push({ path: "taxonomyVersionId", message: "The taxonomy version does not exist." });
    } else {
      const skillIds = content.mappings.flatMap((m) => (m.skillId ? [m.skillId] : []));
      const subskillIds = content.mappings.flatMap((m) => (m.subskillId ? [m.subskillId] : []));
      const found = await this.taxonomy.activeNodesInVersion(content.taxonomyVersionId, {
        skillIds,
        subskillIds,
      });
      content.mappings.forEach((mapping, index) => {
        const known = mapping.skillId
          ? found.skillIds.has(mapping.skillId)
          : mapping.subskillId !== null && found.subskillIds.has(mapping.subskillId);
        if (!known) {
          problems.push({
            path: `mappings.${index}`,
            message: "Must be an active skill or subskill of the question's taxonomy version.",
          });
        }
      });
    }
    if (problems.length > 0) throw new QuestionContentInvalid(problems);
  }
}

function assertPublishable(version: QuestionVersionDetail): void {
  const problems = publishabilityProblems(version);
  if (problems.length > 0) {
    throw new QuestionContentInvalid(problems.map((message) => ({ path: "", message })));
  }
}

/** Human-typable when an import or author does not supply one, e.g. "Q-7F3A9C1B02D4". */
function generateStableCode(): string {
  return `Q-${randomBytes(STABLE_CODE_RANDOM_BYTES).toString("hex").toUpperCase()}`;
}
