import { Inject, Injectable } from "@nestjs/common";
import {
  DRAFT_OPTION_KEYS,
  draftExplanation,
  draftQuestion,
  type QuestionContent,
  type SuggestedDifficulty,
  suggestQuestionMetadata,
} from "@qup/ai-gateway";

import type { ActorContext } from "../../../common/actor.js";
import { USER_DIRECTORY, type UserDirectory } from "../../auth/auth.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  type AssistedVersion,
  DEFAULT_ATTRIBUTION_WEIGHT,
  type DraftContent,
  QUESTION_AUTHOR,
  type QuestionAuthor,
} from "../../questions/questions.contract.js";
import {
  AiNodeNotFound,
  AiNoSkills,
  AiOutputInvalid,
  AiQuestionVersionNotFound,
  AiRequiresDraft,
} from "../domain/ai.errors.js";
import { assistNodes, DIFFICULTY_VALUES } from "../domain/assist-nodes.js";
import { AI_RUN_STORE, type AiRunStore } from "../domain/ports.js";
import { AiRunner } from "./ai-runner.service.js";

/** Tasks this deployment offers authors, in the order the editor shows them. */
const TASKS = [suggestQuestionMetadata.name, draftExplanation.name, draftQuestion.name];
const SUBJECT_QUESTION_VERSION = "question_version";
const SUBJECT_TAXONOMY_NODE = "taxonomy_node";
/** Marks drafts a model wrote, so reviewers know to check them closely. */
export const AI_DRAFT_SOURCE_TYPE = "AI_DRAFT";
/** Existing stems of the skill the model is told not to repeat. */
const AVOID_STEMS_MAX = 15;
/** The run log's summary window. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MetadataSuggestionView {
  skillId: string | null;
  subskillId: string | null;
  nodeName: string;
  difficulty: number;
  rationale: string;
}

export interface QuestionDraftRequest {
  taxonomyVersionId: string;
  /** A skill or subskill id of the version. */
  nodeId: string;
  difficulty: SuggestedDifficulty;
  instructions: string | null;
}

function contentOf(version: AssistedVersion): QuestionContent {
  return { stem: version.stem, options: version.options };
}

const text = (value: string) => ({ blocks: [{ type: "text" as const, text: value }] });

/**
 * AI assistance for question authors (AI_INTEGRATION.md "Question Metadata
 * Suggestion", "Explanation Generation", "Question Generation"). Suggestions
 * are advice the author applies in the editor; a generated question is saved
 * as a DRAFT and goes through review like any other. Nothing here publishes.
 */
@Injectable()
export class AiAssistantService {
  constructor(
    private readonly runner: AiRunner,
    @Inject(AI_RUN_STORE) private readonly runs: AiRunStore,
    @Inject(QUESTION_AUTHOR) private readonly questions: QuestionAuthor,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  status() {
    const provider = this.runner.providerName;
    return provider
      ? { enabled: true, provider, tasks: TASKS }
      : { enabled: false, provider: null, tasks: [] };
  }

  async suggestMetadata(versionId: string, actor: ActorContext): Promise<MetadataSuggestionView> {
    this.runner.assertAvailable();
    const version = await this.draft(versionId);
    const outline = await this.catalog.activeOutline(version.taxonomyVersionId);
    const nodes = outline ? assistNodes(outline) : [];
    if (nodes.length === 0) throw new AiNoSkills();
    const output = await this.runner.run(
      suggestQuestionMetadata,
      { question: contentOf(version), nodes: nodes.map(({ id, name }) => ({ id, name })) },
      { type: SUBJECT_QUESTION_VERSION, id: version.id },
      actor.userId,
    );
    // The task's own check already refused ids outside `nodes`.
    const node = nodes.find((candidate) => candidate.id === output.nodeId);
    if (!node) throw new AiOutputInvalid();
    return {
      skillId: node.skillId,
      subskillId: node.subskillId,
      nodeName: node.name,
      difficulty: DIFFICULTY_VALUES[output.difficulty],
      rationale: output.rationale,
    };
  }

  async draftExplanation(versionId: string, actor: ActorContext): Promise<{ explanation: string }> {
    this.runner.assertAvailable();
    const version = await this.draft(versionId);
    const output = await this.runner.run(
      draftExplanation,
      { question: contentOf(version) },
      { type: SUBJECT_QUESTION_VERSION, id: version.id },
      actor.userId,
    );
    return { explanation: output.explanation };
  }

  /**
   * Writes a new question for a skill and saves it as a DRAFT of the author
   * (AI_INTEGRATION.md "Question Generation"). The draft enters review like
   * any other; the content rules still apply on the way in.
   */
  async draftQuestion(
    request: QuestionDraftRequest,
    actor: ActorContext,
  ): Promise<{ questionId: string; versionId: string }> {
    this.runner.assertAvailable();
    const outline = await this.catalog.activeOutline(request.taxonomyVersionId);
    if (!outline) throw new AiNodeNotFound();
    const node = assistNodes(outline).find((candidate) => candidate.id === request.nodeId);
    if (!node) throw new AiNodeNotFound();
    const [examName] = (await this.catalog.examNames([outline.version.examId])).values();
    const stems = await this.questions.stemTextsInExam(outline.version.examId);

    const output = await this.runner.run(
      draftQuestion,
      {
        examName: examName ?? "",
        skillName: node.name,
        difficulty: request.difficulty,
        instructions: request.instructions,
        avoidStems: stems.slice(0, AVOID_STEMS_MAX).map((stem) => stem.text),
      },
      { type: SUBJECT_TAXONOMY_NODE, id: node.id },
      actor.userId,
    );

    const content: DraftContent = {
      questionType: "SINGLE_CHOICE",
      stem: text(output.stem),
      explanation: text(output.explanation),
      difficulty: DIFFICULTY_VALUES[request.difficulty],
      taxonomyVersionId: request.taxonomyVersionId,
      sourceType: AI_DRAFT_SOURCE_TYPE,
      sourceReference: null,
      options: DRAFT_OPTION_KEYS.map((key, index) => {
        const option = output.options.find((candidate) => candidate.key === key);
        if (!option) throw new AiOutputInvalid();
        return {
          key,
          content: text(option.text),
          isCorrect: key === output.correctOptionKey,
          displayOrder: index,
        };
      }),
      mappings: [
        {
          skillId: node.skillId,
          subskillId: node.subskillId,
          role: "PRIMARY",
          attributionWeight: DEFAULT_ATTRIBUTION_WEIGHT.PRIMARY,
          rationale: null,
        },
      ],
    };
    if (this.questions.contentProblems(content).length > 0) throw new AiOutputInvalid();
    return this.questions.createDraft(content, actor);
  }

  async recentRuns(page: { limit: number; offset: number }) {
    const [{ items, hasMore }, last24h] = await Promise.all([
      this.runs.recent(page),
      this.runs.countsSince(new Date(Date.now() - RECENT_WINDOW_MS)),
    ]);
    const requesters = [...new Set(items.flatMap((run) => run.requestedBy ?? []))];
    const people = await this.users.describe(requesters);
    return {
      items: items.map((run) => ({
        ...run,
        requestedBy: run.requestedBy
          ? {
              id: run.requestedBy,
              ...(people.get(run.requestedBy) ?? { email: null, displayName: null }),
            }
          : null,
      })),
      hasMore,
      last24h,
    };
  }

  private async draft(versionId: string): Promise<AssistedVersion> {
    const version = await this.questions.assistedVersion(versionId);
    if (!version) throw new AiQuestionVersionNotFound();
    if (version.status !== "DRAFT") throw new AiRequiresDraft();
    return version;
  }
}
