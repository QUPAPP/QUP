import { z } from "zod";

import { nodeCode, uuidParam } from "../../../common/validation/schemas.js";

/** PostgreSQL `integer` ceiling: prices and durations are stored in int columns. */
const MAX_INT = 2_147_483_647;
/** Ten years. Longer than that is "no end" (null), not a number of days. */
const MAX_DURATION_DAYS = 3_650;
const MAX_PLAN_NAME_LENGTH = 200;

const planName = z.string().trim().min(1).max(MAX_PLAN_NAME_LENGTH);
/** Minor units (halalas for SAR). An integer: money is never a float. */
const priceMinor = z.number().int().min(0).max(MAX_INT);
const durationDays = z.number().int().min(1).max(MAX_DURATION_DAYS).nullable();
const currency = z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 code");

export const createPlanBody = z.strictObject({
  examId: uuidParam,
  code: nodeCode,
  name: planName,
  priceMinor,
  currency,
  /** Null: access does not end. */
  durationDays,
});
export type CreatePlanBody = z.output<typeof createPlanBody>;

/** Status is not editable here: activation and retirement are their own audited actions. */
export const updatePlanBody = z
  .strictObject({
    name: planName.optional(),
    priceMinor: priceMinor.optional(),
    durationDays: durationDays.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "must change at least one field");
export type UpdatePlanBody = z.output<typeof updatePlanBody>;

export const listPlansQuery = z.strictObject({ examId: uuidParam.optional() });
export type ListPlansQuery = z.output<typeof listPlansQuery>;

export const grantEntitlementBody = z.strictObject({
  studentId: uuidParam,
  examId: uuidParam,
  durationDays,
});
export type GrantEntitlementBody = z.output<typeof grantEntitlementBody>;

/** Only the plan: the price comes from the plan, the student from the session. */
export const checkoutBody = z.strictObject({ planId: uuidParam });
export type CheckoutBody = z.output<typeof checkoutBody>;

export const providerName = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, "must be a provider name");
