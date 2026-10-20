import { z } from "zod";

/** Metric windows the admin screens offer, in days (OBSERVABILITY.md "Metrics"). */
export const ANALYTICS_WINDOWS = [7, 30] as const;

export const analyticsWindowQuery = z.strictObject({
  days: z.coerce
    .number()
    .int()
    .refine((days) => (ANALYTICS_WINDOWS as readonly number[]).includes(days), "must be 7 or 30"),
});
export type AnalyticsWindowQuery = z.output<typeof analyticsWindowQuery>;
