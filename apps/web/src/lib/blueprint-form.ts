import { z } from "zod";

import { nodeCode, normalizeDigits, optionalNumber, requiredName, WEIGHT_MAX } from "./admin-forms";
import type { Blueprint, BlueprintUpdate } from "./blueprint-api";

/**
 * Blueprint forms. They check what each input looks like; what may change and
 * whether the weights leave a domain to ask from are the API's rules.
 */

/** Matches the API's bounds (OPEN_QUESTIONS.md #9a); the API still checks. */
const QUESTION_COUNT = { min: 1, max: 200 } as const;

const questionCount = z
  .string()
  .transform(normalizeDigits)
  .refine(
    (value) =>
      /^\d{1,3}$/.test(value) &&
      Number(value) >= QUESTION_COUNT.min &&
      Number(value) <= QUESTION_COUNT.max,
    `عدد صحيح من ${QUESTION_COUNT.min} إلى ${QUESTION_COUNT.max}`,
  )
  .transform(Number);

/** Matches the API (MOCK_TIME_LIMIT_MINUTES); blank keeps the per-question default. */
const TIME_LIMIT_MINUTES = { min: 5, max: 300 } as const;

const timeLimitMinutes = z
  .string()
  .optional()
  .transform((value) => normalizeDigits(value ?? ""))
  .refine(
    (value) =>
      value.trim() === "" ||
      (/^\d{1,3}$/.test(value.trim()) &&
        Number(value) >= TIME_LIMIT_MINUTES.min &&
        Number(value) <= TIME_LIMIT_MINUTES.max),
    `بالدقائق، من ${TIME_LIMIT_MINUTES.min} إلى ${TIME_LIMIT_MINUTES.max}، أو اتركه فارغًا`,
  )
  .transform((value) => (value.trim() === "" ? null : Number(value)));

/** Blank keeps the taxonomy's weight (null); 0 leaves the domain out. */
const domainWeight = optionalNumber(
  /^\d{1,2}(\.\d{1,4})?$/,
  (value) => value >= 0 && value <= WEIGHT_MAX,
  "الوزن من 0 حتى 99.9999، بأربع خانات عشرية كحد أقصى",
).transform((weight) => weight ?? null);

export const blueprintCreateSchema = z.object({
  type: z.enum(["MINI_DIAGNOSTIC", "FULL_DIAGNOSTIC", "MOCK_EXAM"]),
  code: nodeCode,
  name: requiredName,
  questionCount,
  /** Sent only for a mock exam; the diagnostics are untimed. */
  timeLimitMinutes,
});
export type BlueprintCreateFormInput = z.input<typeof blueprintCreateSchema>;
export type BlueprintCreateForm = z.output<typeof blueprintCreateSchema>;

export const blueprintEditSchema = z.object({
  name: requiredName,
  questionCount,
  timeLimitMinutes,
  /** One per domain, in the blueprint's domain order. */
  weights: z.array(domainWeight),
});
export type BlueprintEditFormInput = z.input<typeof blueprintEditSchema>;
export type BlueprintEditForm = z.output<typeof blueprintEditSchema>;

export function formFromBlueprint(blueprint: Blueprint): BlueprintEditFormInput {
  return {
    name: blueprint.name,
    questionCount: String(blueprint.questionCount),
    timeLimitMinutes: blueprint.timeLimitMinutes === null ? "" : String(blueprint.timeLimitMinutes),
    weights: blueprint.domains.map((domain) =>
      domain.weight === null ? "" : String(domain.weight),
    ),
  };
}

/** Every domain is sent, so the saved blueprint is exactly what the form shows. */
export function toUpdateBody(blueprint: Blueprint, form: BlueprintEditForm): BlueprintUpdate {
  return {
    name: form.name,
    questionCount: form.questionCount,
    ...(blueprint.type === "MOCK_EXAM" ? { timeLimitMinutes: form.timeLimitMinutes } : {}),
    domainWeights: blueprint.domains.map((domain, index) => ({
      domainId: domain.id,
      weight: form.weights[index] ?? null,
    })),
  };
}
