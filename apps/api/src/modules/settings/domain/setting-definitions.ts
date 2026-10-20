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

export const SETTING_DEFINITIONS = {
  [PRELIMINARY_LEVELS_KEY]: {
    valueType: "JSON",
    description: "Lowest performance percentage for each preliminary diagnostic level.",
    schema: levelsSchema,
    defaultValue: DEFAULT_PRELIMINARY_LEVELS,
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
