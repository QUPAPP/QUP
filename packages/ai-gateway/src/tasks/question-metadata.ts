import { z } from "zod";

import { DATA_ONLY_RULES, escapeXml, type QuestionContent, questionBlock } from "../prompt.js";
import type { AiTask } from "../task.js";

/** A taxonomy node the question may be mapped to (skills, and subskills named `skill › sub`). */
export interface MetadataNode {
  id: string;
  name: string;
}

export interface MetadataSuggestionInput {
  question: QuestionContent;
  nodes: MetadataNode[];
}

export const SUGGESTED_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type SuggestedDifficulty = (typeof SUGGESTED_DIFFICULTIES)[number];

const RATIONALE_MAX_CHARS = 500;

const metadataSuggestionSchema = z.object({
  nodeId: z.string().min(1),
  difficulty: z.enum(SUGGESTED_DIFFICULTIES),
  rationale: z.string().trim().min(1).max(RATIONALE_MAX_CHARS),
});

export type MetadataSuggestion = z.infer<typeof metadataSuggestionSchema>;

const SYSTEM = [
  "You help an author classify a multiple-choice exam question.",
  "Choose the single skill the question tests most, from the <skills> list only, and its difficulty.",
  DATA_ONLY_RULES,
  `Shape: {"nodeId": "<id from the list>", "difficulty": "EASY" | "MEDIUM" | "HARD", "rationale": "<one or two sentences in Arabic, at most ${RATIONALE_MAX_CHARS} characters>"}`,
].join("\n");

/** AI_INTEGRATION.md "Question Metadata Suggestion": advice for the author, never applied by itself. */
export const suggestQuestionMetadata: AiTask<MetadataSuggestionInput, MetadataSuggestion> = {
  name: "suggest_question_metadata",
  promptVersion: "metadata-v1",
  schemaVersion: "1",
  schema: metadataSuggestionSchema,
  maxOutputTokens: 400,
  buildPrompt({ question, nodes }) {
    const skills = nodes.map(
      (node) => `<skill id="${escapeXml(node.id)}">${escapeXml(node.name)}</skill>`,
    );
    return {
      system: SYSTEM,
      prompt: [questionBlock(question), "<skills>", ...skills, "</skills>"].join("\n"),
    };
  },
  verify(output, { nodes }) {
    return nodes.some((node) => node.id === output.nodeId) ? null : "UNKNOWN_NODE";
  },
};
