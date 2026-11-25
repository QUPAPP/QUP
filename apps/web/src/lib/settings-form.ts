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

/* ---------------------------------------------------- full re-diagnostic gate */

/** PRD §8: days since the last full measurement, and training answers since then. */
export type GateValue = { cooldownDays: number; minTrainingAttempts: number };

/** A whole number; its upper bounds are the API's rule (SETTING_VALUE_INVALID). */
const wholeNumber = z
  .string()
  .transform(normalizeDigits)
  .refine((value) => /^\d{1,4}$/.test(value), "عدد صحيح");

const MAX_COOLDOWN_DAYS = 365;
const MAX_TRAINING_ATTEMPTS = 1000;

export const gateFormSchema = z.object({
  cooldownDays: wholeNumber.refine(
    (value) => Number(value) <= MAX_COOLDOWN_DAYS,
    "من 0 إلى 365 يومًا",
  ),
  minTrainingAttempts: wholeNumber.refine(
    (value) => Number(value) <= MAX_TRAINING_ATTEMPTS,
    "من 0 إلى 1000 إجابة",
  ),
});
export type GateFormInput = z.input<typeof gateFormSchema>;
export type GateForm = z.output<typeof gateFormSchema>;

export function formFromGate(value: GateValue): GateFormInput {
  return {
    cooldownDays: String(value.cooldownDays),
    minTrainingAttempts: String(value.minTrainingAttempts),
  };
}

export function toGateValue(form: GateForm): GateValue {
  return {
    cooldownDays: Number(form.cooldownDays),
    minTrainingAttempts: Number(form.minTrainingAttempts),
  };
}

/** The study chat's extra rules, as the API keeps them. */
export interface ChatRulesValue {
  rules: string[];
}

export const CHAT_RULES_MAX = 20;
export const CHAT_RULE_MAX_CHARS = 300;

/** One rule per line; blank lines dropped. */
export function rulesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The first problem with a set of rules, in Arabic, or null when the API will accept it. */
export function chatRulesProblem(rules: readonly string[]): string | null {
  if (rules.length > CHAT_RULES_MAX) return `الحد الأقصى ${CHAT_RULES_MAX} قاعدة.`;
  const index = rules.findIndex((rule) => rule.length > CHAT_RULE_MAX_CHARS);
  return index === -1 ? null : `القاعدة ${index + 1} أطول من ${CHAT_RULE_MAX_CHARS} حرف.`;
}

/** The free study chat replies before subscribing, as the API keeps them. */
export interface FreeTrialValue {
  chatMessages: number;
}

export const FREE_CHAT_MESSAGES_MAX = 100;

/** The problem with a typed allowance, in Arabic, or null when the API will accept it. */
export function freeTrialProblem(text: string): string | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return "اكتب عددًا صحيحًا من 0 فأكثر.";
  return Number(value) > FREE_CHAT_MESSAGES_MAX ? `الحد الأقصى ${FREE_CHAT_MESSAGES_MAX}.` : null;
}

/** The platform-wide AI ceiling over 24 hours (setting ai.dailyBudget); null is no limit. */
export interface AiBudgetValue {
  maxRuns: number | null;
  maxTokens: number | null;
}

/** A blank field is no limit; anything else must be a whole number from 1. */
export function budgetLimitProblem(text: string): string | null {
  const value = text.trim();
  if (value === "") return null;
  if (!/^\d+$/.test(value) || Number(value) < 1)
    return "اكتب عددًا صحيحًا من 1 فأكثر، أو اتركه فارغًا.";
  return Number.isSafeInteger(Number(value)) ? null : "العدد كبير جدًا.";
}

export function parseBudgetLimit(text: string): number | null {
  const value = text.trim();
  return value === "" ? null : Number(value);
}
