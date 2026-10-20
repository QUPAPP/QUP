import { z } from "zod";

/**
 * Form schemas for the admin panel. Like auth-forms.ts, they only spare a
 * round trip: the limits mirror the API's DTOs (catalog.dto.ts and
 * common/validation/schemas.ts) so the two never disagree, and the API
 * validates everything again. Inputs arrive as strings from the form.
 */

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const WEIGHT_MAX = 99.9999;
const PERCENT_MAX = 100;
const MIN_COVERAGE_MAX = 10_000;
const DISPLAY_ORDER_MAX = 1_000_000;

/** API thresholds are shares with 3 decimals; the form shows percentages with 1. */
const PERCENT_DECIMAL_FACTOR = 10;
const SHARE_DECIMAL_FACTOR = 1000;

export function percentToShare(percent: number): number {
  return Math.round(percent * PERCENT_DECIMAL_FACTOR) / SHARE_DECIMAL_FACTOR;
}

export function shareToPercent(share: number): number {
  return Math.round(share * SHARE_DECIMAL_FACTOR) / PERCENT_DECIMAL_FACTOR;
}

/** Fields that can be empty become optional; the others stay required. */
type WithoutNulls<T> = {
  [K in keyof T as null extends T[K] ? K : undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    null | undefined
  >;
} & {
  [K in keyof T as null extends T[K] ? never : undefined extends T[K] ? never : K]: T[K];
};

/** Removes empty fields: create requests omit what was left blank. */
export function dropNulls<T extends Record<string, unknown>>(values: T): WithoutNulls<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined),
  ) as WithoutNulls<T>;
}

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Admins type in an Arabic interface: ٨٥٫٥ and ۸۵٫۵ both mean 85.5. */
function normalizeDigits(raw: string): string {
  return raw
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/٫/g, ".");
}

/** A blank input is "not provided"; anything else must match and pass the check. */
function optionalNumber(pattern: RegExp, isValid: (value: number) => boolean, message: string) {
  return z.string().transform((raw, context): number | undefined => {
    const value = normalizeDigits(raw);
    if (value === "") return undefined;
    const parsed = Number(value);
    if (!pattern.test(value) || !isValid(parsed)) {
      context.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return parsed;
  });
}

const weightField = optionalNumber(
  /^\d{1,2}(\.\d{1,4})?$/,
  (value) => value > 0 && value <= WEIGHT_MAX,
  "الوزن رقم أكبر من 0 حتى 99.9999، بأربع خانات عشرية كحد أقصى",
);

/** Blank means "use the versioned default" (null), as the API defines it. */
const thresholdField = optionalNumber(
  /^\d{1,3}(\.\d)?$/,
  (value) => value > 0 && value <= PERCENT_MAX,
  "النسبة أكبر من 0 حتى 100، بخانة عشرية واحدة كحد أقصى",
).transform((percent) => (percent === undefined ? null : percentToShare(percent)));

const minCoverageField = optionalNumber(
  /^\d+$/,
  (value) => value <= MIN_COVERAGE_MAX,
  "التغطية عدد صحيح من 0 حتى 10000",
);

const displayOrderField = optionalNumber(
  /^\d+$/,
  (value) => value <= DISPLAY_ORDER_MAX,
  "الترتيب عدد صحيح من 0 فأكثر",
);

const requiredName = z
  .string()
  .trim()
  .min(1, "هذا الحقل مطلوب")
  .max(NAME_MAX, `${NAME_MAX} حرفًا كحد أقصى`);

/** Blank → null: on edit it clears the field; create requests drop it (dropNulls). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} حرفًا كحد أقصى`)
    .transform((value) => (value === "" ? null : value));

const nodeCode = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9_.-]{0,63}$/, "رمز بحروف إنجليزية كبيرة وأرقام و _ . - فقط");

/* ------------------------------------------------------------------ exams */

export const examCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "رمز بحروف إنجليزية كبيرة وأرقام و _ ، يبدأ بحرف"),
  slug: z
    .string()
    .trim()
    .max(64, "64 حرفًا كحد أقصى")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "كلمات إنجليزية صغيرة تفصلها شرطة، مثل verbal-part"),
  nameAr: requiredName,
  nameEn: optionalText(NAME_MAX),
  description: optionalText(DESCRIPTION_MAX),
});
export type ExamCreateFormInput = z.input<typeof examCreateSchema>;
export type ExamCreateForm = z.output<typeof examCreateSchema>;

export const examEditSchema = examCreateSchema.pick({
  nameAr: true,
  nameEn: true,
  description: true,
});
export type ExamEditFormInput = z.input<typeof examEditSchema>;
export type ExamEditForm = z.output<typeof examEditSchema>;

/* --------------------------------------------------------------- versions */

export const versionCreateSchema = z.object({
  versionCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, "حروف إنجليزية وأرقام و . _ - فقط، مثل 2026.1"),
  // <input type="date"> gives YYYY-MM-DD; the API stores UTC instants.
  effectiveFrom: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "تاريخ غير صحيح")
    .transform((value) =>
      value === "" ? undefined : new Date(`${value}T00:00:00Z`).toISOString(),
    ),
});
export type VersionCreateFormInput = z.input<typeof versionCreateSchema>;
export type VersionCreateForm = z.output<typeof versionCreateSchema>;

/* ------------------------------------------------------------------ nodes */

export const domainFormSchema = z.object({
  code: nodeCode,
  name: requiredName,
  description: optionalText(DESCRIPTION_MAX),
  weight: weightField,
  displayOrder: displayOrderField,
});
export type DomainFormInput = z.input<typeof domainFormSchema>;
export type DomainForm = z.output<typeof domainFormSchema>;

export const subskillFormSchema = domainFormSchema
  .extend({ masteryThresholdPercent: thresholdField })
  .transform(({ masteryThresholdPercent, ...rest }) => ({
    ...rest,
    masteryThreshold: masteryThresholdPercent,
  }));
export type SubskillFormInput = z.input<typeof subskillFormSchema>;
export type SubskillForm = z.output<typeof subskillFormSchema>;

export const skillFormSchema = domainFormSchema
  .extend({
    masteryThresholdPercent: thresholdField,
    priorityWeight: weightField,
    minCoverage: minCoverageField,
  })
  .transform(({ masteryThresholdPercent, ...rest }) => ({
    ...rest,
    masteryThreshold: masteryThresholdPercent,
  }));
export type SkillFormInput = z.input<typeof skillFormSchema>;
export type SkillForm = z.output<typeof skillFormSchema>;
