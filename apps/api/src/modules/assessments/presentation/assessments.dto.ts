import { z } from "zod";

import { MAX_RECORDED_RESPONSE_TIME_MS } from "../domain/assessment-config.js";

/** API_CONTRACTS.md "Submit Answer". Strict: a client cannot send its own `isCorrect`. */

const optionKey = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{1,8}$/, "must be an option key");

const clientTiming = z
  .strictObject({
    /** Recorded for analytics; never scored in V1 (ADAPTIVE_ENGINE.md §11). */
    responseTimeMs: z.number().int().min(0).max(MAX_RECORDED_RESPONSE_TIME_MS),
  })
  .optional();

export const answerBody = z.strictObject({
  answer: z.union([
    z.strictObject({ optionKey }),
    z.strictObject({ optionKeys: z.array(optionKey).min(1).max(6) }),
  ]),
  clientTiming,
});
export type AnswerBody = z.output<typeof answerBody>;

export const skipBody = z.strictObject({ clientTiming }).optional();
export type SkipBody = z.output<typeof skipBody>;
