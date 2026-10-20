import { z } from "zod";

import { DATA_ONLY_RULES, type QuestionContent, questionBlock } from "../prompt.js";
import type { AiTask } from "../task.js";

export interface ExplanationDraftInput {
  question: QuestionContent;
}

const EXPLANATION_MAX_CHARS = 1500;

const explanationDraftSchema = z.object({
  correctOptionKeys: z.array(z.string().min(1)).min(1),
  explanation: z.string().trim().min(1).max(EXPLANATION_MAX_CHARS),
});

export type ExplanationDraft = z.infer<typeof explanationDraftSchema>;

const SYSTEM = [
  "You draft a short explanation of a multiple-choice exam question for students, in Arabic.",
  'The options marked correct="true" are the right answer. Explain why they are right, and briefly why the others are not.',
  DATA_ONLY_RULES,
  `Shape: {"correctOptionKeys": ["<key>", ...], "explanation": "<at most ${EXPLANATION_MAX_CHARS} characters>"}`,
  "correctOptionKeys must repeat the keys marked correct, exactly.",
].join("\n");

/** The answer key the author saved, sorted, to compare with what the model says. */
export function correctKeys(question: QuestionContent): string[] {
  return question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.key)
    .sort();
}

/**
 * AI_INTEGRATION.md "Explanation Generation": a draft for the author. The
 * model must restate the saved answer key; a draft that argues for another
 * answer is rejected rather than shown.
 */
export const draftExplanation: AiTask<ExplanationDraftInput, ExplanationDraft> = {
  name: "draft_explanation",
  promptVersion: "explanation-v1",
  schemaVersion: "1",
  schema: explanationDraftSchema,
  maxOutputTokens: 1000,
  buildPrompt({ question }) {
    return { system: SYSTEM, prompt: questionBlock(question) };
  },
  verify(output, { question }) {
    const said = [...new Set(output.correctOptionKeys)].sort();
    const saved = correctKeys(question);
    const agrees = said.length === saved.length && said.every((key, i) => key === saved[i]);
    return agrees ? null : "ANSWER_MISMATCH";
  },
};
