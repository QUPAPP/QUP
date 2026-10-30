import { z } from "zod";

import { normalizeDigits } from "./admin-forms";

const MINOR_UNITS = 100;
const MAX_DURATION_DAYS = 3650;

const price = z
  .string()
  .transform(normalizeDigits)
  .refine((value) => /^\d{1,7}(\.\d{1,2})?$/.test(value), "مبلغ بالريال، حتى منزلتين عشريتين");

const duration = z
  .string()
  .transform(normalizeDigits)
  .refine(
    (value) =>
      value === "" ||
      (/^\d{1,4}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_DURATION_DAYS),
    "عدد أيام من 1 إلى 3650، أو اتركه فارغًا لوصول بلا نهاية",
  );

export const planFormSchema = z.object({
  examId: z.string().min(1, "اختر الاختبار"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_.-]{0,63}$/, "حروف إنجليزية كبيرة وأرقام و _ . - فقط"),
  name: z.string().trim().min(1, "اكتب اسم الباقة").max(200),
  price,
  durationDays: duration,
});
export type PlanFormInput = z.input<typeof planFormSchema>;
export type PlanForm = z.output<typeof planFormSchema>;

export const planEditSchema = planFormSchema.pick({ name: true, price: true, durationDays: true });
export type PlanEditInput = z.input<typeof planEditSchema>;
export type PlanEdit = z.output<typeof planEditSchema>;

export const grantFormSchema = z.object({
  examId: z.string().min(1, "اختر الاختبار"),
  durationDays: duration,
});
export type GrantFormInput = z.input<typeof grantFormSchema>;
export type GrantForm = z.output<typeof grantFormSchema>;

export function toMinorUnits(riyals: string): number {
  const [whole = "0", fraction = ""] = riyals.split(".");
  return Number(whole) * MINOR_UNITS + Number(fraction.padEnd(2, "0"));
}

export function fromMinorUnits(amountMinor: number): string {
  const whole = Math.floor(amountMinor / MINOR_UNITS);
  const fraction = amountMinor % MINOR_UNITS;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function toDurationDays(value: string): number | null {
  return value === "" ? null : Number(value);
}

export function durationText(days: number | null): string {
  if (days === null) return "بلا نهاية";
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  if (days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}
