import { z } from "zod";

import { isApiError } from "./api";
import type {
  ContentProblem,
  DraftContentInput,
  MappingRole,
  QuestionType,
  QuestionVersion,
  RichContent,
} from "./question-api";

/**
 * The question editor's form model. Limits mirror the API's DTO
 * (questions.dto.ts) only to spare a round trip; whether an answer key or the
 * mappings are complete is the API's rule, reported as QUESTION_CONTENT_INVALID
 * with a rule code and explained here in Arabic.
 */

const MAX_BLOCKS = 50;
const MAX_TEXT = 5_000;
const MAX_LATEX = 2_000;
const MAX_OPTIONS = 6;
const MAX_MAPPINGS = 10;
const MAX_RATIONALE = 1_000;
const MAX_SOURCE_TYPE = 100;
const MAX_SOURCE_REFERENCE = 500;
const NEW_QUESTION_OPTIONS = 4;
const FIRST_OPTION_LETTER = 65; // "A"

/** Authoring presets of ADAPTIVE_ENGINE.md §4; calibrated difficulty is a separate, later value. */
export const DIFFICULTY_PRESETS = [
  { value: 0.25, label: "سهل" },
  { value: 0.5, label: "متوسط" },
  { value: 0.75, label: "صعب" },
  { value: 0.9, label: "متقدم" },
] as const;

const DEFAULT_DIFFICULTY = 0.5;

export const QUESTION_TYPES: readonly { value: QuestionType; label: string }[] = [
  { value: "SINGLE_CHOICE", label: "اختيار من متعدد (إجابة واحدة)" },
  { value: "MULTIPLE_CHOICE", label: "اختيار من متعدد (أكثر من إجابة)" },
  { value: "TRUE_FALSE", label: "صح أو خطأ" },
];

export function optionKey(index: number): string {
  return String.fromCharCode(FIRST_OPTION_LETTER + index);
}

/* ----------------------------------------------------------------- schema */

const blockSchema = z
  .object({ type: z.enum(["text", "math"]), value: z.string() })
  .refine((block) => block.value.length <= (block.type === "text" ? MAX_TEXT : MAX_LATEX), {
    message: "النص أطول من المسموح",
    path: ["value"],
  });

const hasContent = (blocks: { value: string }[]) => blocks.some((b) => b.value.trim() !== "");

const blocksSchema = z.array(blockSchema).max(MAX_BLOCKS, `${MAX_BLOCKS} مقطعًا كحد أقصى`);

const optionSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,8}$/, "رمز الخيار حروف إنجليزية كبيرة أو أرقام"),
  content: blocksSchema.refine(hasContent, "اكتب نص الخيار"),
  isCorrect: z.boolean(),
});

const mappingSchema = z.object({
  /** "skill:<id>" or "subskill:<id>", as the select stores it. */
  target: z.string().regex(/^(skill|subskill):.+$/, "اختر المهارة"),
  role: z.enum(["PRIMARY", "SECONDARY"]),
  weight: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || (/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/.test(value) && Number(value) > 0),
      "الوزن رقم أكبر من 0 حتى 1، بأربع خانات عشرية كحد أقصى",
    ),
  rationale: z.string().max(MAX_RATIONALE, `${MAX_RATIONALE} حرف كحد أقصى`),
});

export const questionFormSchema = z.object({
  questionType: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"]),
  stem: blocksSchema.refine(hasContent, "اكتب نص السؤال"),
  explanation: blocksSchema,
  difficulty: z
    .string()
    .refine((value) => /^(0(\.\d{1,3})?|1(\.0{1,3})?)$/.test(value), "الصعوبة رقم من 0 إلى 1"),
  taxonomyVersionId: z.string().min(1, "اختر نسخة التصنيف"),
  sourceType: z.string().max(MAX_SOURCE_TYPE, `${MAX_SOURCE_TYPE} حرف كحد أقصى`),
  sourceReference: z.string().max(MAX_SOURCE_REFERENCE, `${MAX_SOURCE_REFERENCE} حرف كحد أقصى`),
  options: z.array(optionSchema).max(MAX_OPTIONS, `${MAX_OPTIONS} خيارات كحد أقصى`),
  mappings: z.array(mappingSchema).max(MAX_MAPPINGS, `${MAX_MAPPINGS} مهارات كحد أقصى`),
});

export type QuestionForm = z.infer<typeof questionFormSchema>;
export type BlockField = QuestionForm["stem"][number];

export const FORM_LIMITS = { blocks: MAX_BLOCKS, options: MAX_OPTIONS, mappings: MAX_MAPPINGS };

/* ------------------------------------------------------------- conversion */

const toBlocks = (content: RichContent | null): BlockField[] =>
  (content?.blocks ?? []).map((block) =>
    block.type === "text"
      ? { type: "text", value: block.text }
      : { type: "math", value: block.latex },
  );

function toRichContent(blocks: BlockField[]): RichContent {
  return {
    blocks: blocks
      .filter((block) => block.value.trim() !== "")
      .map((block) =>
        block.type === "text"
          ? { type: "text", text: block.value }
          : { type: "math", latex: block.value.trim() },
      ),
  };
}

export function emptyQuestionForm(): QuestionForm {
  return {
    questionType: "SINGLE_CHOICE",
    stem: [{ type: "text", value: "" }],
    explanation: [],
    difficulty: String(DEFAULT_DIFFICULTY),
    taxonomyVersionId: "",
    sourceType: "",
    sourceReference: "",
    options: Array.from({ length: NEW_QUESTION_OPTIONS }, (_, index) => ({
      key: optionKey(index),
      content: [{ type: "text", value: "" }],
      isCorrect: false,
    })),
    mappings: [],
  };
}

export function formFromVersion(version: QuestionVersion): QuestionForm {
  return {
    questionType: version.questionType,
    stem: toBlocks(version.stem),
    explanation: toBlocks(version.explanation),
    difficulty: String(version.difficulty),
    taxonomyVersionId: version.taxonomyVersionId,
    sourceType: version.sourceType ?? "",
    sourceReference: version.sourceReference ?? "",
    options: [...version.options]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((option) => ({
        key: option.key,
        content: toBlocks(option.content),
        isCorrect: option.isCorrect,
      })),
    mappings: version.mappings.map((mapping) => ({
      target: mapping.skillId ? `skill:${mapping.skillId}` : `subskill:${mapping.subskillId}`,
      role: mapping.role,
      weight: String(mapping.attributionWeight),
      rationale: mapping.rationale ?? "",
    })),
  };
}

/** Form → the API's content body. Empty optional fields are omitted, never sent blank. */
export function toDraftContentInput(form: QuestionForm): DraftContentInput {
  const explanation = toRichContent(form.explanation);
  const sourceType = form.sourceType.trim();
  const sourceReference = form.sourceReference.trim();
  return {
    questionType: form.questionType,
    stem: toRichContent(form.stem),
    ...(explanation.blocks.length > 0 ? { explanation } : {}),
    difficulty: Number(form.difficulty),
    taxonomyVersionId: form.taxonomyVersionId,
    ...(sourceType ? { sourceType } : {}),
    ...(sourceReference ? { sourceReference } : {}),
    options: form.options.map((option, index) => ({
      key: option.key.trim(),
      content: toRichContent(option.content),
      isCorrect: option.isCorrect,
      displayOrder: index,
    })),
    mappings: form.mappings.map((mapping) => {
      const [kind, id] = splitTarget(mapping.target);
      const weight = mapping.weight.trim();
      const rationale = mapping.rationale.trim();
      return {
        ...(kind === "skill" ? { skillId: id } : { subskillId: id }),
        role: mapping.role as MappingRole,
        ...(weight ? { attributionWeight: Number(weight) } : {}),
        ...(rationale ? { rationale } : {}),
      };
    }),
  };
}

function splitTarget(target: string): ["skill" | "subskill", string] {
  const separator = target.indexOf(":");
  const kind = target.slice(0, separator) === "subskill" ? "subskill" : "skill";
  return [kind, target.slice(separator + 1)];
}

/* ---------------------------------------------------------------- messages */

const RULE_MESSAGES: Record<string, string> = {
  OPTION_COUNT: "عدد الخيارات لا يناسب نوع السؤال.",
  CORRECT_ANSWER_COUNT: "عدد الإجابات الصحيحة المحددة لا يناسب نوع السؤال.",
  PRIMARY_MAPPING_COUNT: "اربط السؤال بمهارة أساسية (PRIMARY) واحدة بالضبط.",
  DUPLICATE_OPTION_KEY: "لخيارين الرمز نفسه. اجعل لكل خيار رمزًا مختلفًا.",
  DUPLICATE_MAPPING: "رُبطت المهارة نفسها أكثر من مرة.",
  MAPPING_OUTSIDE_VERSION: "إحدى المهارات المربوطة ليست مهارة نشطة في نسخة التصنيف المختارة.",
  TAXONOMY_VERSION_MISSING: "نسخة التصنيف المختارة غير موجودة.",
  DATABASE_RULE: "رُفض المحتوى عند الحفظ (الإجابة الصحيحة أو الربط). راجع السؤال.",
};

const UNKNOWN_RULE = "لم يستوفِ السؤال أحد الشروط.";

/** One Arabic line per broken rule of a QUESTION_CONTENT_INVALID error; [] otherwise. */
export function contentProblemMessages(error: unknown): string[] {
  if (!isApiError(error, "QUESTION_CONTENT_INVALID")) return [];
  const details = Array.isArray(error.details) ? (error.details as ContentProblem[]) : [];
  const lines = details.map((problem) =>
    problem.rule ? (RULE_MESSAGES[problem.rule] ?? UNKNOWN_RULE) : UNKNOWN_RULE,
  );
  return [...new Set(lines.length > 0 ? lines : [UNKNOWN_RULE])];
}
