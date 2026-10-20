import { Inject, Injectable } from "@nestjs/common";
import {
  type AiProvider,
  type AiRunStatus,
  type AiTask,
  draftExplanation,
  type QuestionContent,
  runAiTask,
  suggestQuestionMetadata,
} from "@qup/ai-gateway";

import type { ActorContext } from "../../../common/actor.js";
import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { USER_DIRECTORY, type UserDirectory } from "../../auth/auth.contract.js";
import { CATALOG_LOOKUP, type CatalogLookup } from "../../catalog/catalog.contract.js";
import {
  type AssistedVersion,
  QUESTION_AUTHOR,
  type QuestionAuthor,
} from "../../questions/questions.contract.js";
import { AI_PROVIDER } from "../ai.contract.js";
import {
  AiNoSkills,
  AiOutputInvalid,
  AiQuestionVersionNotFound,
  AiRequiresDraft,
  AiTimedOut,
  AiUnavailable,
} from "../domain/ai.errors.js";
import { assistNodes, DIFFICULTY_VALUES } from "../domain/assist-nodes.js";
import { AI_RUN_STORE, type AiRunStore } from "../domain/ports.js";

/** Tasks this deployment offers, in the order the editor shows them. */
const TASKS = [suggestQuestionMetadata.name, draftExplanation.name];
const SUBJECT_QUESTION_VERSION = "question_version";
/** The run log's summary window. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MetadataSuggestionView {
  skillId: string | null;
  subskillId: string | null;
  nodeName: string;
  difficulty: number;
  rationale: string;
}

function failure(status: Exclude<AiRunStatus, "SUCCEEDED">): Error {
  if (status === "INVALID_OUTPUT") return new AiOutputInvalid();
  if (status === "TIMED_OUT") return new AiTimedOut();
  return new AiUnavailable();
}

function contentOf(version: AssistedVersion): QuestionContent {
  return { stem: version.stem, options: version.options };
}

/**
 * AI assistance for question authors (AI_INTEGRATION.md "Question Metadata
 * Suggestion", "Explanation Generation"). Advice only: nothing here writes a
 * question. The author applies what they accept in the editor, and the
 * version still goes through review. Every run is recorded, whatever its end.
 */
@Injectable()
export class AiAssistantService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
    @Inject(AI_RUN_STORE) private readonly runs: AiRunStore,
    @Inject(QUESTION_AUTHOR) private readonly questions: QuestionAuthor,
    @Inject(CATALOG_LOOKUP) private readonly catalog: CatalogLookup,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  status() {
    return this.provider
      ? { enabled: true, provider: this.provider.name, tasks: TASKS }
      : { enabled: false, provider: null, tasks: [] };
  }

  async suggestMetadata(versionId: string, actor: ActorContext): Promise<MetadataSuggestionView> {
    const provider = this.requireProvider();
    const version = await this.draft(versionId);
    const outline = await this.catalog.activeOutline(version.taxonomyVersionId);
    const nodes = outline ? assistNodes(outline) : [];
    if (nodes.length === 0) throw new AiNoSkills();
    const output = await this.run(
      provider,
      suggestQuestionMetadata,
      { question: contentOf(version), nodes: nodes.map(({ id, name }) => ({ id, name })) },
      version.id,
      actor,
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
    const provider = this.requireProvider();
    const version = await this.draft(versionId);
    const output = await this.run(
      provider,
      draftExplanation,
      { question: contentOf(version) },
      version.id,
      actor,
    );
    return { explanation: output.explanation };
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

  private requireProvider(): AiProvider {
    if (!this.provider) throw new AiUnavailable();
    return this.provider;
  }

  private async draft(versionId: string): Promise<AssistedVersion> {
    const version = await this.questions.assistedVersion(versionId);
    if (!version) throw new AiQuestionVersionNotFound();
    if (version.status !== "DRAFT") throw new AiRequiresDraft();
    return version;
  }

  private async run<I, O>(
    provider: AiProvider,
    task: AiTask<I, O>,
    input: I,
    versionId: string,
    actor: ActorContext,
  ): Promise<O> {
    const result = await runAiTask(provider, task, input, {
      timeoutMs: this.config.ai.timeoutMs,
      maxAttempts: this.config.ai.maxAttempts,
    });
    await this.runs.record({
      ...result.run,
      requestedBy: actor.userId,
      subjectType: SUBJECT_QUESTION_VERSION,
      subjectId: versionId,
      output: result.ok ? result.output : null,
    });
    if (result.ok) return result.output;
    throw failure(result.run.status as Exclude<AiRunStatus, "SUCCEEDED">);
  }
}
