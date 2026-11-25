import { z } from "zod";

import { SettingValueInvalid } from "./settings.errors.js";

/**
 * The settings an admin may change, each typed and validated (ERD.md: "versioned
 * typed settings; critical rules should not hide in arbitrary JSON"). A key not
 * listed here cannot be stored. Each value's default is the version-0 baseline
 * used until an admin saves a first version.
 */

export const PRELIMINARY_LEVELS_KEY = "assessment.preliminaryResult.levels";

/** OPEN_QUESTIONS.md #10b: five diagnostic levels, lowest first. */
export const PRELIMINARY_LEVEL_ORDER = [
  "NEEDS_FOUNDATION",
  "BEGINNER",
  "INTERMEDIATE",
  "GOOD",
  "ADVANCED",
] as const;

export type PreliminaryLevel = (typeof PRELIMINARY_LEVEL_ORDER)[number];
export type PreliminaryLevelsValue = readonly { level: PreliminaryLevel; fromPercentage: number }[];

const MAX_PERCENTAGE = 100;

/** OPEN_QUESTIONS.md #10c defaults (awaiting the product owner's confirmation). */
export const DEFAULT_PRELIMINARY_LEVELS: PreliminaryLevelsValue = Object.freeze([
  { level: "NEEDS_FOUNDATION", fromPercentage: 0 },
  { level: "BEGINNER", fromPercentage: 40 },
  { level: "INTERMEDIATE", fromPercentage: 55 },
  { level: "GOOD", fromPercentage: 70 },
  { level: "ADVANCED", fromPercentage: 85 },
] as const);

const levelsSchema = z
  .array(
    z.strictObject({
      level: z.enum(PRELIMINARY_LEVEL_ORDER),
      fromPercentage: z.number().int().min(0).max(MAX_PERCENTAGE),
    }),
  )
  .length(PRELIMINARY_LEVEL_ORDER.length)
  .superRefine((bands, context) => {
    bands.forEach((band, index) => {
      if (band.level !== PRELIMINARY_LEVEL_ORDER[index]) {
        context.addIssue({
          code: "custom",
          path: [index, "level"],
          message: `Level ${index + 1} must be ${PRELIMINARY_LEVEL_ORDER[index]}.`,
        });
      }
      const previous = bands[index - 1];
      if (previous && band.fromPercentage <= previous.fromPercentage) {
        context.addIssue({
          code: "custom",
          path: [index, "fromPercentage"],
          message: "Boundaries must increase from one level to the next.",
        });
      }
    });
    // Every score needs a level, so the lowest band starts at 0.
    if (bands[0] && bands[0].fromPercentage !== 0) {
      context.addIssue({
        code: "custom",
        path: [0, "fromPercentage"],
        message: "The lowest level starts at 0.",
      });
    }
  });

export const FULL_REASSESSMENT_GATE_KEY = "assessment.fullReassessment.gate";

export interface FullReassessmentGateValue {
  cooldownDays: number;
  minTrainingAttempts: number;
}

const MAX_COOLDOWN_DAYS = 365;
const MAX_TRAINING_ATTEMPTS = 1_000;

/** PRD §8 / WORKFLOWS.md §6 defaults: a 7-day cooldown and 30 new training answers. */
export const DEFAULT_FULL_REASSESSMENT_GATE: FullReassessmentGateValue = Object.freeze({
  cooldownDays: 7,
  minTrainingAttempts: 30,
});

const gateSchema = z.strictObject({
  cooldownDays: z.number().int().min(0).max(MAX_COOLDOWN_DAYS),
  minTrainingAttempts: z.number().int().min(0).max(MAX_TRAINING_ATTEMPTS),
});

export const STUDY_CHAT_RULES_KEY = "ai.studyChat.rules";

export interface StudyChatRulesValue {
  rules: readonly string[];
}

const MAX_CHAT_RULES = 20;
const MAX_CHAT_RULE_CHARS = 300;

/**
 * The platform's own rules for the study chat, on top of the fixed ones in
 * code (AI_INTEGRATION.md "Study Chat"). They can narrow what the assistant
 * does, never widen it.
 */
export const DEFAULT_STUDY_CHAT_RULES: StudyChatRulesValue = Object.freeze({
  rules: Object.freeze([
    "اربط كل شرح بمهارة من مهارات الاختبار، واقترح على الطالب تدريبًا عليها في المنصة.",
    "لا تذكر منصات أو دورات أو مدرسين آخرين ولا توصِ بها.",
    "إذا سأل الطالب عن الاشتراك أو الدفع أو الاسترجاع فوجّهه إلى صفحة الاشتراكات أو إلى الدعم.",
  ]),
});

const chatRulesSchema = z.strictObject({
  rules: z.array(z.string().trim().min(1).max(MAX_CHAT_RULE_CHARS)).max(MAX_CHAT_RULES),
});

export const AI_FREE_TRIAL_KEY = "ai.freeTrial";

export interface AiFreeTrialValue {
  /** Study chat replies a student gets before subscribing, once per account. */
  chatMessages: number;
}

const MAX_FREE_CHAT_MESSAGES = 100;

/** A taste of the study chat before subscribing (OPEN_QUESTIONS.md #18). 0 turns it off. */
export const DEFAULT_AI_FREE_TRIAL: AiFreeTrialValue = Object.freeze({ chatMessages: 5 });

const freeTrialSchema = z.strictObject({
  chatMessages: z.number().int().min(0).max(MAX_FREE_CHAT_MESSAGES),
});

export const AI_DAILY_BUDGET_KEY = "ai.dailyBudget";

/**
 * A ceiling on what AI may spend across the whole platform in any 24 hours
 * (AI_INTEGRATION.md "Cost Control"): per-student limits bound one person,
 * this bounds everyone together, e.g. a burst of throwaway accounts. Null is
 * no ceiling. Counted from ai_runs, so every task counts, students and staff.
 */
export interface AiDailyBudgetValue {
  /** AI calls in the last 24 hours. */
  maxRuns: number | null;
  /** Input + output tokens in the last 24 hours. */
  maxTokens: number | null;
}

const MAX_DAILY_RUNS = 1_000_000;
const MAX_DAILY_TOKENS = 10_000_000_000;

/** No ceiling until an admin sets one (OPEN_QUESTIONS.md #19f): the number is a business decision. */
export const DEFAULT_AI_DAILY_BUDGET: AiDailyBudgetValue = Object.freeze({
  maxRuns: null,
  maxTokens: null,
});

const dailyBudgetSchema = z.strictObject({
  maxRuns: z.number().int().min(1).max(MAX_DAILY_RUNS).nullable(),
  maxTokens: z.number().int().min(1).max(MAX_DAILY_TOKENS).nullable(),
});

export const SETTING_DEFINITIONS = {
  [PRELIMINARY_LEVELS_KEY]: {
    valueType: "JSON",
    description: "Lowest performance percentage for each preliminary diagnostic level.",
    schema: levelsSchema,
    defaultValue: DEFAULT_PRELIMINARY_LEVELS,
  },
  [FULL_REASSESSMENT_GATE_KEY]: {
    valueType: "JSON",
    description:
      "When a student may take the full re-diagnostic again: days since the last full measurement, and training answers since then.",
    schema: gateSchema,
    defaultValue: DEFAULT_FULL_REASSESSMENT_GATE,
  },
  [STUDY_CHAT_RULES_KEY]: {
    valueType: "JSON",
    description:
      "Extra rules the study chat follows on top of its fixed ones. They can only narrow what it does.",
    schema: chatRulesSchema,
    defaultValue: DEFAULT_STUDY_CHAT_RULES,
  },
  [AI_FREE_TRIAL_KEY]: {
    valueType: "JSON",
    description:
      "Study chat replies a student gets free, once per account, before subscribing. 0 turns the free trial off.",
    schema: freeTrialSchema,
    defaultValue: DEFAULT_AI_FREE_TRIAL,
  },
  [AI_DAILY_BUDGET_KEY]: {
    valueType: "JSON",
    description:
      "Most AI calls and tokens the whole platform may use in any 24 hours. Null is no limit. Past it, AI answers AI_DAILY_BUDGET_REACHED until usage falls.",
    schema: dailyBudgetSchema,
    defaultValue: DEFAULT_AI_DAILY_BUDGET as AiDailyBudgetValue,
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFINITIONS)[K]["defaultValue"];

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_DEFINITIONS, key);
}

/** Validates a value for a key; throws SettingValueInvalid with one issue per problem. */
export function parseSettingValue<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  const result = SETTING_DEFINITIONS[key].schema.safeParse(value);
  if (!result.success) {
    throw new SettingValueInvalid(
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data as SettingValue<K>;
}
