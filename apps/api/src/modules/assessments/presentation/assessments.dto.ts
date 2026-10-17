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

const HISTORY_PAGE_DEFAULT = 20;
const HISTORY_PAGE_MAX = 100;
const HISTORY_OFFSET_MAX = 1_000_000;

export const sessionHistoryQuery = z.strictObject({
  examId: z.uuid().optional(),
  status: z.enum(["CREATED", "IN_PROGRESS", "COMPLETED", "ABANDONED", "EXPIRED"]).optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_PAGE_MAX).default(HISTORY_PAGE_DEFAULT),
  offset: z.coerce.number().int().min(0).max(HISTORY_OFFSET_MAX).default(0),
});
export type SessionHistoryQuery = z.output<typeof sessionHistoryQuery>;
