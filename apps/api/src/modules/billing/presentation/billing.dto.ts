import { z } from "zod";

import { displayOrder, nodeCode, uuidParam } from "../../../common/validation/schemas.js";
import { PLAN_LIMITS } from "../domain/plan-rules.js";

/** PostgreSQL `integer` ceiling: prices and durations are stored in int columns. */
const MAX_INT = 2_147_483_647;
/** Ten years. Longer than that is "no end" (null), not a number of days. */
const MAX_DURATION_DAYS = 3_650;
const LEDGER_DEFAULT_PAGE = 25;
const LEDGER_MAX_PAGE = 100;

const planName = z.string().trim().min(1).max(PLAN_LIMITS.maxNameLength);
/** Minor units (halalas for SAR). An integer: money is never a float. */
const priceMinor = z.number().int().min(0).max(MAX_INT);
const durationDays = z.number().int().min(1).max(MAX_DURATION_DAYS).nullable();
const currency = z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 code");
/** Blank means "no description". */
const description = z
  .string()
  .trim()
  .max(PLAN_LIMITS.maxDescriptionLength)
  .transform((value) => (value === "" ? null : value))
  .nullable();
/** Blank lines are dropped; what remains is shown in order. */
const features = z
  .array(z.string().trim().max(PLAN_LIMITS.maxFeatureLength))
  .transform((lines) => lines.filter((line) => line !== ""))
  .pipe(z.array(z.string()).max(PLAN_LIMITS.maxFeatures));
const examIds = z.array(uuidParam).min(1).max(PLAN_LIMITS.maxExams);
const compareAtPriceMinor = z.number().int().min(1).max(MAX_INT).nullable();

export const createPlanBody = z.strictObject({
  /** One exam, or several for a bundle. */
  examIds,
  code: nodeCode,
  name: planName,
  description: description.default(null),
  features: features.default([]),
  highlighted: z.boolean().default(false),
  sortOrder: displayOrder.default(0),
  priceMinor,
  compareAtPriceMinor: compareAtPriceMinor.default(null),
  currency,
  /** Null: access does not end. */
  durationDays,
});
export type CreatePlanBody = z.output<typeof createPlanBody>;

/**
 * Status, code and currency are not editable here: activation and retirement
 * are their own audited actions, and payments refer to the code and currency.
 * Which fields the plan's status allows is decided by plan-rules.ts.
 */
export const updatePlanBody = z
  .strictObject({
    name: planName.optional(),
    description: description.optional(),
    features: features.optional(),
    highlighted: z.boolean().optional(),
    sortOrder: displayOrder.optional(),
    priceMinor: priceMinor.optional(),
    compareAtPriceMinor: compareAtPriceMinor.optional(),
    durationDays: durationDays.optional(),
    examIds: examIds.optional(),
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

export const studentLookupQuery = z.strictObject({
  identifier: z.string().trim().min(3).max(320),
});
export type StudentLookupQuery = z.output<typeof studentLookupQuery>;

/** Only the plan: the price comes from the plan, the student from the session. */
export const checkoutBody = z.strictObject({ planId: uuidParam });
export type CheckoutBody = z.output<typeof checkoutBody>;

export const providerName = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, "must be a provider name");

/* ------------------------------ Admin ledger ------------------------------ */

/** Opaque to clients: base64url of "<ISO created_at>|<payment id>". */
export function encodeLedgerCursor(position: { createdAt: Date; id: string }): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`).toString("base64url");
}

const ledgerCursor = z
  .string()
  .max(200)
  .transform((value, context) => {
    const [iso = "", id = ""] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !uuidParam.safeParse(id).success) {
      context.addIssue({ code: "custom", message: "is not a valid cursor" });
      return z.NEVER;
    }
    return { createdAt, id };
  });

export const listPaymentsQuery = z.strictObject({
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "CANCELLED"]).optional(),
  cursor: ledgerCursor.optional(),
  limit: z.coerce.number().int().min(1).max(LEDGER_MAX_PAGE).default(LEDGER_DEFAULT_PAGE),
});
export type ListPaymentsQuery = z.output<typeof listPaymentsQuery>;

/** The provider's own id for a payment, as its dashboard shows it. */
const MAX_PROVIDER_PAYMENT_ID = 128;

export const reconcilePaymentBody = z.strictObject({
  providerPaymentId: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PROVIDER_PAYMENT_ID)
    // An id, not a path: it goes into the provider's URL.
    .regex(/^[A-Za-z0-9_-]+$/, "letters, digits, - and _ only"),
});
export type ReconcilePaymentBody = z.output<typeof reconcilePaymentBody>;
