import { z } from "zod";

import { DATA_ONLY_RULES, escapeXml, type QuestionContent, questionBlock } from "../prompt.js";
import type { AiTask } from "../task.js";
import { correctKeys } from "./explanation.js";

/** AI_INTEGRATION.md "Error Classification": UNKNOWN is a valid answer. */
export const ERROR_TYPES = [
  "CONCEPTUAL_ERROR",
  "CALCULATION_ERROR",
  "MISREAD_QUESTION",
  "PREREQUISITE_GAP",
  "UNKNOWN",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export interface MistakeExplanationInput {
  question: QuestionContent;
  /** The keys the student chose; at least one is wrong. */
  chosenKeys: string[];
  /** The reviewed explanation, when the question has one: the grounding the model must agree with. */
  approvedExplanation: string | null;
  /** The skill the question measures, for the hint about what to revise. */
  skillName: string | null;
}

const EXPLANATION_MAX_CHARS = 1200;
const TIP_MAX_CHARS = 300;

const mistakeExplanationSchema = z.object({
  correctOptionKeys: z.array(z.string().min(1)).min(1),
  errorType: z.enum(ERROR_TYPES),
  explanation: z.string().trim().min(1).max(EXPLANATION_MAX_CHARS),
  tip: z.string().trim().min(1).max(TIP_MAX_CHARS),
});

export type MistakeExplanation = z.infer<typeof mistakeExplanationSchema>;

const SYSTEM = [
  "You are a patient tutor for a Saudi student preparing for a standardized exam. Write in clear Modern Standard Arabic.",
  'The options marked correct="true" are the right answer; they are final. Never argue for another option.',
  "The student chose the options in <chosen>. Explain, in a few short sentences, the most likely reason that choice is wrong, then why the correct option is right.",
  "When <approved_explanation> is present, stay consistent with it: it was reviewed by a teacher.",
  "Classify the student's most likely error as one of CONCEPTUAL_ERROR, CALCULATION_ERROR, MISREAD_QUESTION, PREREQUISITE_GAP or UNKNOWN. Use UNKNOWN when unsure.",
  "Add one practical tip for next time, one sentence.",
  DATA_ONLY_RULES,
  `Shape: {"correctOptionKeys": ["<key>", ...], "errorType": "<one of the five>", "explanation": "<at most ${EXPLANATION_MAX_CHARS} characters>", "tip": "<at most ${TIP_MAX_CHARS} characters>"}`,
  "correctOptionKeys must repeat the keys marked correct, exactly.",
].join("\n");

/**
 * A personalised explanation of one wrong answer, for the student who gave it
 * (AI_INTEGRATION.md "Student Explanation"). Grounded on the stored answer key
 * and the reviewed explanation; a reply that names another answer is refused,
 * and the student keeps the reviewed explanation.
 */
export const explainMistake: AiTask<MistakeExplanationInput, MistakeExplanation> = {
  name: "explain_mistake",
  promptVersion: "mistake-v1",
  schemaVersion: "1",
  schema: mistakeExplanationSchema,
  maxOutputTokens: 900,
  buildPrompt({ question, chosenKeys, approvedExplanation, skillName }) {
    const parts = [
      questionBlock(question),
      `<chosen>${chosenKeys.map(escapeXml).join(",")}</chosen>`,
    ];
    if (approvedExplanation) {
      parts.push(`<approved_explanation>${escapeXml(approvedExplanation)}</approved_explanation>`);
    }
    if (skillName) parts.push(`<skill>${escapeXml(skillName)}</skill>`);
    return { system: SYSTEM, prompt: parts.join("\n") };
  },
  verify(output, { question }) {
    const said = [...new Set(output.correctOptionKeys)].sort();
    const saved = correctKeys(question);
    const agrees = said.length === saved.length && said.every((key, i) => key === saved[i]);
    return agrees ? null : "ANSWER_MISMATCH";
  },
};
