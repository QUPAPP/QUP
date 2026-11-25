import { z } from "zod";

/**
 * Form schemas for sign-in and sign-up. They exist to help the student fix
 * mistakes before a round trip; the API validates everything again and is the
 * only authority (AGENTS.md §9: no business rules duplicated in the UI). The
 * limits mirror the API's so the two never disagree about a valid password.
 */

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const MAX_NAME_LENGTH = 80;

/** Blank optional inputs are "not provided", not empty strings to validate. */
const blankToUndefined = (value: string) => (value.trim() === "" ? undefined : value.trim());

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/**
 * The phone as the API expects it (E.164). Students type their number the
 * way they say it: "05XXXXXXXX", with spaces, or in Arabic digits. Saudi
 * local and international forms become +9665XXXXXXXX; anything else is
 * returned as typed (digits converted) for the API to judge.
 */
export function normalizePhone(raw: string): string {
  const latin = raw.replace(ARABIC_DIGITS, (digit) =>
    String((digit.charCodeAt(0) - (digit >= "۰" ? 0x06f0 : 0x0660)) % 10),
  );
  const compact = latin.replace(/[\s\-().]/g, "");
  if (/^05\d{8}$/.test(compact)) return `+966${compact.slice(1)}`;
  if (/^5\d{8}$/.test(compact)) return `+966${compact}`;
  if (/^9665\d{8}$/.test(compact)) return `+${compact}`;
  if (/^00[1-9]\d{7,14}$/.test(compact)) return `+${compact.slice(2)}`;
  return compact;
}

/** An email is sent as typed; anything else is read as a phone number. */
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.includes("@") ? trimmed : normalizePhone(trimmed);
}

export const loginForm = z.object({
  identifier: z.string().trim().min(1, "اكتب بريدك أو رقم جوالك").transform(normalizeIdentifier),
  password: z.string().min(1, "اكتب كلمة المرور"),
});
export type LoginForm = z.infer<typeof loginForm>;

export const registerForm = z
  .object({
    displayName: z.string().max(MAX_NAME_LENGTH, "الاسم طويل جدًا").transform(blankToUndefined),
    email: z
      .string()
      .transform(blankToUndefined)
      .pipe(z.email("بريد إلكتروني غير صحيح").optional()),
    phone: z
      .string()
      .transform((value) => {
        const phone = blankToUndefined(value);
        return phone === undefined ? undefined : normalizePhone(phone);
      })
      .pipe(
        z
          .string()
          .regex(/^\+[1-9]\d{7,14}$/, "اكتب رقم جوال صحيحًا، مثل 05XXXXXXXX")
          .optional(),
      ),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `كلمة المرور ${PASSWORD_MIN_LENGTH} حرفًا على الأقل`)
      .max(PASSWORD_MAX_LENGTH, "كلمة المرور طويلة جدًا"),
    // An explicit tick, not "by signing up you agree": consent is recorded per account (PDPL).
    acceptTerms: z.boolean().refine((value) => value, "وافق على الشروط وسياسة الخصوصية للمتابعة"),
  })
  .refine((form) => form.email !== undefined || form.phone !== undefined, {
    message: "اكتب بريدك الإلكتروني أو رقم جوالك (أو كليهما)",
    path: ["email"],
  });
export type RegisterFormInput = z.input<typeof registerForm>;
export type RegisterForm = z.output<typeof registerForm>;

export const profileForm = z.object({
  displayName: z.string().trim().max(MAX_NAME_LENGTH, "الاسم طويل جدًا"),
});
export type ProfileForm = z.infer<typeof profileForm>;

export const passwordForm = z
  .object({
    currentPassword: z.string().min(1, "اكتب كلمة المرور الحالية"),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `كلمة المرور ${PASSWORD_MIN_LENGTH} حرفًا على الأقل`)
      .max(PASSWORD_MAX_LENGTH, "كلمة المرور طويلة جدًا"),
    confirmPassword: z.string(),
  })
  .refine((form) => form.newPassword === form.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  })
  .refine((form) => form.newPassword !== form.currentPassword, {
    message: "اختر كلمة مرور مختلفة عن الحالية",
    path: ["newPassword"],
  });
export type PasswordForm = z.infer<typeof passwordForm>;

/* ---------------------------- one-time codes ---------------------------- */

/** Mirrors the API's code length (otp-policy.ts); the API stays the only judge. */
const CODE_LENGTH = 6;

/**
 * What was typed or pasted, as the digits of a code: Arabic-Indic digits
 * become Latin, spaces and dashes go, and nothing past the code's length is kept.
 */
export function normalizeCodeInput(raw: string): string {
  return raw
    .replace(ARABIC_DIGITS, (digit) =>
      String((digit.charCodeAt(0) - (digit >= "۰" ? 0x06f0 : 0x0660)) % 10),
    )
    .replace(/\D/g, "")
    .slice(0, CODE_LENGTH);
}

const code = z
  .string()
  .transform(normalizeCodeInput)
  .refine((value) => value.length === CODE_LENGTH, `الرمز ${CODE_LENGTH} أرقام`);

export const codeForm = z.object({ code });
export type CodeFormInput = z.input<typeof codeForm>;
export type CodeForm = z.output<typeof codeForm>;

export const forgotForm = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("بريد إلكتروني غير صحيح")),
});
export type ForgotForm = z.infer<typeof forgotForm>;

export const resetForm = z
  .object({
    code,
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `كلمة المرور ${PASSWORD_MIN_LENGTH} حرفًا على الأقل`)
      .max(PASSWORD_MAX_LENGTH, "كلمة المرور طويلة جدًا"),
    confirmPassword: z.string(),
  })
  .refine((form) => form.newPassword === form.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });
export type ResetFormInput = z.input<typeof resetForm>;
export type ResetForm = z.output<typeof resetForm>;

/* ---------------------------- account erasure ---------------------------- */

/** What the person types to show they mean it; the API receives its own literal. */
export const ERASE_PHRASE = "حذف حسابي";

export const eraseAccountForm = z.object({
  password: z.string().min(1, "اكتب كلمة المرور"),
  phrase: z
    .string()
    .trim()
    .refine((value) => value === ERASE_PHRASE, `اكتب «${ERASE_PHRASE}» كما هي للتأكيد`),
});
export type EraseAccountFormInput = z.input<typeof eraseAccountForm>;
export type EraseAccountForm = z.output<typeof eraseAccountForm>;
