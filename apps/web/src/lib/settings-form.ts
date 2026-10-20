import { z } from "zod";

import { normalizeDigits } from "./admin-forms";

/**
 * The level-boundary form. It only checks each input is a whole number up to
 * 100; that the first level starts at 0 and the boundaries increase is the
 * API's rule (SETTING_VALUE_INVALID).
 */

export const LEVEL_ORDER = [
  "NEEDS_FOUNDATION",
  "BEGINNER",
  "INTERMEDIATE",
  "GOOD",
  "ADVANCED",
] as const;
export type LevelCode = (typeof LEVEL_ORDER)[number];

/** Display names, matching the labels students see on their preliminary result. */
export const LEVEL_LABELS: Record<LevelCode, string> = {
  NEEDS_FOUNDATION: "يحتاج تأسيس",
  BEGINNER: "مبتدئ",
  INTERMEDIATE: "متوسط",
  GOOD: "جيد",
  ADVANCED: "متقدم",
};

export type LevelsValue = { level: string; fromPercentage: number }[];

const MAX_PERCENTAGE = 100;

const boundary = z
  .string()
  .transform(normalizeDigits)
  .refine(
    (value) => /^\d{1,3}$/.test(value) && Number(value) <= MAX_PERCENTAGE,
    "عدد صحيح من 0 إلى 100",
  );

export const levelsFormSchema = z.object({
  boundaries: z.array(boundary).length(LEVEL_ORDER.length),
});
export type LevelsFormInput = z.input<typeof levelsFormSchema>;
export type LevelsForm = z.output<typeof levelsFormSchema>;

export function formFromLevels(value: LevelsValue): LevelsFormInput {
  return {
    boundaries: LEVEL_ORDER.map((level) =>
      String(value.find((band) => band.level === level)?.fromPercentage ?? ""),
    ),
  };
}

export function toLevelsValue(form: LevelsForm | LevelsFormInput): LevelsValue {
  return LEVEL_ORDER.map((level, index) => ({
    level,
    fromPercentage: Number(normalizeDigits(form.boundaries[index] ?? "")),
  }));
}
