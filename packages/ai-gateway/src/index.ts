// @qup/ai-gateway — the AI gateway from AI_INTEGRATION.md: versioned tasks with
// Zod-validated JSON output, bounded retries, timeouts and a run record.
// Framework-free and vendor-free: providers plug in behind `AiProvider`.
export { FAKE_MODEL, FakeAiProvider, type FakeFailure } from "./fake-provider.js";
export {
  DATA_ONLY_RULES,
  escapeXml,
  type ParsedOutput,
  parseJsonOutput,
  type QuestionContent,
  questionBlock,
} from "./prompt.js";
export type { AiCompletion, AiCompletionRequest, AiProvider, AiUsage } from "./provider.js";
export {
  AI_RUN_STATUSES,
  type AiRunOptions,
  type AiRunRecord,
  type AiRunResult,
  type AiRunStatus,
  runAiTask,
} from "./run.js";
export type { AiTask } from "./task.js";
export {
  correctKeys,
  draftExplanation,
  type ExplanationDraft,
  type ExplanationDraftInput,
} from "./tasks/explanation.js";
export {
  type MetadataNode,
  type MetadataSuggestion,
  type MetadataSuggestionInput,
  SUGGESTED_DIFFICULTIES,
  type SuggestedDifficulty,
  suggestQuestionMetadata,
} from "./tasks/question-metadata.js";
