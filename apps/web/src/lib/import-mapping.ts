import { z } from "zod";

import type { ImportBatch, ImportBatchStatus, ImportItemStatus, ImportMapping } from "./import-api";

/**
 * The column-mapping form. It only checks that the required fields are
 * chosen; whether the columns fit the file and the rows are valid is the
 * API's decision (IMPORT_MAPPING_INVALID, row codes).
 */

export const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

type OptionalField = "subskill" | "questionType" | "explanation" | "difficulty" | "source";
const OPTIONAL_FIELDS: readonly OptionalField[] = [
  "subskill",
  "questionType",
  "explanation",
  "difficulty",
  "source",
];

export const MAPPING_FIELDS: { field: keyof Omit<ImportMapping, "options">; label: string }[] = [
  { field: "stem", label: "نص السؤال" },
  { field: "correctAnswer", label: "الإجابة الصحيحة" },
  { field: "skill", label: "المهارة (رمزها أو اسمها)" },
  { field: "subskill", label: "المهارة الفرعية (اختياري)" },
  { field: "questionType", label: "نوع السؤال (اختياري)" },
  { field: "explanation", label: "الشرح (اختياري)" },
  { field: "difficulty", label: "الصعوبة (اختياري)" },
  { field: "source", label: "المصدر (اختياري)" },
];

const chosen = z.string().min(1, "اختر عمودًا");

export const mappingFormSchema = z.object({
  taxonomyVersionId: z.string().min(1, "اختر نسخة التصنيف"),
  stem: chosen,
  options: z
    .array(z.string())
    .length(MAX_OPTIONS)
    .refine(
      (columns) => columns.filter((column) => column !== "").length >= MIN_OPTIONS,
      "اختر عمودين للخيارات على الأقل",
    ),
  correctAnswer: chosen,
  skill: chosen,
  subskill: z.string(),
  questionType: z.string(),
  explanation: z.string(),
  difficulty: z.string(),
  source: z.string(),
});
export type MappingForm = z.output<typeof mappingFormSchema>;

/** The last mapping used on this batch, else the API's suggestion; "" is "no column". */
export function formFromBatch(batch: ImportBatch): MappingForm {
  const source: Partial<ImportMapping> = batch.mapping ?? batch.suggestedMapping ?? {};
  const options = [...(source.options ?? [])];
  return {
    taxonomyVersionId: batch.taxonomyVersionId ?? "",
    stem: source.stem ?? "",
    options: Array.from({ length: MAX_OPTIONS }, (_, index) => options[index] ?? ""),
    correctAnswer: source.correctAnswer ?? "",
    skill: source.skill ?? "",
    subskill: source.subskill ?? "",
    questionType: source.questionType ?? "",
    explanation: source.explanation ?? "",
    difficulty: source.difficulty ?? "",
    source: source.source ?? "",
  };
}

export function toProcessBody(form: MappingForm): {
  taxonomyVersionId: string;
  mapping: ImportMapping;
} {
  const mapping: ImportMapping = {
    stem: form.stem,
    options: form.options.filter((column) => column !== ""),
    correctAnswer: form.correctAnswer,
    skill: form.skill,
  };
  for (const field of OPTIONAL_FIELDS) {
    if (form[field] !== "") mapping[field] = form[field];
  }
  return { taxonomyVersionId: form.taxonomyVersionId, mapping };
}

export const ITEM_STATUS_LABELS: Record<ImportItemStatus, string> = {
  PENDING: "لم يُفحص بعد",
  VALID: "جاهز",
  INVALID: "يحتاج تصحيحًا",
  DUPLICATE: "مكرر",
  IMPORTED: "أُنشئت مسودته",
  SKIPPED: "متجاوَز",
};

export const BATCH_STATUS_LABELS: Record<ImportBatchStatus, string> = {
  UPLOADED: "بانتظار ربط الأعمدة",
  QUEUED: "في الانتظار",
  PARSING: "قيد القراءة",
  VALIDATING: "قيد الفحص",
  READY_FOR_REVIEW: "جاهز للمراجعة",
  COMPLETED: "اكتمل",
  PARTIALLY_FAILED: "اكتمل مع رفض بعض الصفوف",
  FAILED: "فشل",
};

const ROW_ERRORS: Record<string, string> = {
  STEM_MISSING: "نص السؤال فارغ",
  OPTIONS_TOO_FEW: "أقل من خيارين",
  CORRECT_ANSWER_MISSING: "الإجابة الصحيحة فارغة",
  CORRECT_ANSWER_UNKNOWN: "الإجابة الصحيحة لا تطابق أي خيار",
  QUESTION_TYPE_UNKNOWN: "نوع السؤال غير معروف",
  SKILL_UNKNOWN: "المهارة غير موجودة في نسخة التصنيف",
  SUBSKILL_UNKNOWN: "المهارة الفرعية غير موجودة تحت هذه المهارة",
  DIFFICULTY_INVALID: "الصعوبة غير مفهومة (رقم من 0 إلى 1 أو 100، أو سهل/متوسط/صعب)",
  OPTION_COUNT: "عدد الخيارات لا يناسب نوع السؤال",
  CORRECT_ANSWER_COUNT: "عدد الإجابات الصحيحة لا يناسب نوع السؤال",
  DUPLICATE_OPTION_KEY: "مفاتيح الخيارات مكررة",
  DUPLICATE_IN_BANK: "السؤال موجود في بنك الأسئلة",
  DUPLICATE_IN_FILE: "السؤال مكرر في هذا الملف",
  DRAFT_REJECTED: "رفض بنك الأسئلة إنشاء المسودة",
};

/** Arabic for a row problem; an unknown code is shown as is rather than hidden. */
export function rowErrorLabel(code: string): string {
  return ROW_ERRORS[code] ?? code;
}
