import { z } from "zod";

import { decimal } from "../../../common/validation/schemas.js";
import { DEFAULT_ATTRIBUTION_WEIGHT, type DraftContent } from "../domain/question-content.js";

/**
 * Request bodies for the question bank. Strict objects throughout.
 * Limits bound storage and rendering cost; they are generous for real content.
 */

const MAX_BLOCKS = 50;
const MAX_TEXT = 5_000;
const MAX_LATEX = 2_000;
const MAX_OPTIONS = 6;
const MAX_MAPPINGS = 10;

const contentBlock = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string().min(1).max(MAX_TEXT) }),
  z.strictObject({ type: z.literal("math"), latex: z.string().min(1).max(MAX_LATEX) }),
]);

const richContent = z.strictObject({ blocks: z.array(contentBlock).min(1).max(MAX_BLOCKS) });

const option = z.strictObject({
  key: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,8}$/, "must be 1–8 of A–Z, 0–9"),
  content: richContent,
  isCorrect: z.boolean(),
  displayOrder: z.number().int().min(0).max(100).optional(),
});

const mapping = z
  .strictObject({
    skillId: z.uuid().optional(),
    subskillId: z.uuid().optional(),
    role: z.enum(["PRIMARY", "SECONDARY"]),
    /** Defaults by role (DOMAIN_MODEL.md §6): PRIMARY 1.00, SECONDARY 0.35. */
    attributionWeight: decimal({ scale: 4, min: 0, max: 1 }).optional(),
    rationale: z.string().trim().min(1).max(1_000).optional(),
  })
  .refine(
    (m) => (m.skillId === undefined) !== (m.subskillId === undefined),
    "map exactly one of skillId or subskillId",
  );

export const draftContentBody = z.strictObject({
  questionType: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"]),
  stem: richContent,
  explanation: richContent.optional(),
  /** ADAPTIVE_ENGINE.md §4 — normalized 0..1 (EASY 0.25 … ADVANCED 0.90). */
  difficulty: decimal({ scale: 3, min: 0, minInclusive: true, max: 1 }),
  taxonomyVersionId: z.uuid(),
  sourceType: z.string().trim().min(1).max(100).optional(),
  sourceReference: z.string().trim().min(1).max(500).optional(),
  options: z.array(option).max(MAX_OPTIONS),
  mappings: z.array(mapping).max(MAX_MAPPINGS),
});
export type DraftContentBody = z.output<typeof draftContentBody>;

export const createQuestionBody = z.strictObject({
  stableCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9_.-]{1,63}$/, "must be 2–64 of A–Z, 0–9, _ . -")
    .optional(),
  content: draftContentBody,
});
export type CreateQuestionBody = z.output<typeof createQuestionBody>;

export const reviewBody = z
  .strictObject({
    decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
    notes: z.string().trim().min(1).max(2_000).optional(),
  })
  // A version sent back must say why, or the author cannot act on it.
  .refine((r) => r.decision === "APPROVED" || r.notes !== undefined, {
    message: "notes are required when the version is not approved",
    path: ["notes"],
  });
export type ReviewBody = z.output<typeof reviewBody>;

const PAGE_LIMIT_DEFAULT = 20;
const PAGE_LIMIT_MAX = 100;

export const listQuestionsQuery = z.strictObject({
  status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"]).optional(),
  taxonomyVersionId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListQuestionsQuery = z.output<typeof listQuestionsQuery>;

/** Boundary → domain: fills defaults so the domain never sees an absent weight or order. */
export function toDraftContent(body: DraftContentBody): DraftContent {
  return {
    questionType: body.questionType,
    stem: body.stem,
    explanation: body.explanation ?? null,
    difficulty: body.difficulty,
    taxonomyVersionId: body.taxonomyVersionId,
    sourceType: body.sourceType ?? null,
    sourceReference: body.sourceReference ?? null,
    options: body.options.map((o, index) => ({
      key: o.key,
      content: o.content,
      isCorrect: o.isCorrect,
      displayOrder: o.displayOrder ?? index,
    })),
    mappings: body.mappings.map((m) => ({
      skillId: m.skillId ?? null,
      subskillId: m.subskillId ?? null,
      role: m.role,
      attributionWeight: m.attributionWeight ?? DEFAULT_ATTRIBUTION_WEIGHT[m.role],
      rationale: m.rationale ?? null,
    })),
  };
}
