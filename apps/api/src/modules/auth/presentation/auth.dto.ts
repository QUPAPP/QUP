import { z } from "zod";

import { E164_PHONE } from "../domain/identifiers.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
} from "../domain/password-policy.js";

/**
 * Request bodies. Strict objects: unknown keys are rejected, so a client cannot
 * slip `role`, `status` or `permissions` into a sign-up (mass assignment).
 */

const MAX_EMAIL_LENGTH = 254; // RFC 5321 path limit
const MAX_DISPLAY_NAME_LENGTH = 80;

// Normalized before validation so " A@X.com " and "a@x.com" are the same account.
const email = z.string().trim().toLowerCase().pipe(z.email().max(MAX_EMAIL_LENGTH));

const phone = z
  .string()
  .trim()
  .regex(E164_PHONE, `must be in international E.164 format, e.g. +9665XXXXXXXX`);

const newPassword = z
  .string()
  .refine(
    (value) => passwordLength(value) >= PASSWORD_MIN_LENGTH,
    `must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  .refine(
    (value) => passwordLength(value) <= PASSWORD_MAX_LENGTH,
    `must be at most ${PASSWORD_MAX_LENGTH} characters`,
  );

/**
 * The version of the terms and privacy policy the person accepted: the date the
 * web app publishes them under (LEGAL_UPDATED_AT). Required, so no account
 * exists without a record of what its owner agreed to (PDPL consent).
 */
const termsVersion = z.iso.date();

/** The token the human-check widget gave the browser (Turnstile tokens are at most 2048 chars). */
const MAX_CAPTCHA_TOKEN = 2048;
const captchaToken = z.string().min(1).max(MAX_CAPTCHA_TOKEN).optional();

export const registerBody = z
  .strictObject({
    email: email.optional(),
    phone: phone.optional(),
    password: newPassword,
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
    acceptedTermsVersion: termsVersion,
    captchaToken,
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "provide an email, a phone number, or both",
    path: ["email"],
  });

export type RegisterBody = z.output<typeof registerBody>;

/** Accepting the terms again after they changed. */
export const acceptTermsBody = z.strictObject({ acceptedTermsVersion: termsVersion });
export type AcceptTermsBody = z.output<typeof acceptTermsBody>;

export const loginBody = z.strictObject({
  identifier: z.string().trim().min(1).max(MAX_EMAIL_LENGTH),
  // No minimum at login: the policy may tighten after a password was set. The
  // maximum still applies, to bound hashing cost.
  password: z
    .string()
    .min(1)
    .refine(
      (value) => passwordLength(value) <= PASSWORD_MAX_LENGTH,
      `must be at most ${PASSWORD_MAX_LENGTH} characters`,
    ),
});

export type LoginBody = z.output<typeof loginBody>;

export const updateProfileBody = z.strictObject({
  displayName: z
    .string()
    .trim()
    .max(MAX_DISPLAY_NAME_LENGTH)
    .transform((value) => value || null),
});

export type UpdateProfileBody = z.output<typeof updateProfileBody>;

export const changePasswordBody = z.strictObject({
  currentPassword: z
    .string()
    .min(1)
    .refine(
      (value) => passwordLength(value) <= PASSWORD_MAX_LENGTH,
      `must be at most ${PASSWORD_MAX_LENGTH} characters`,
    ),
  newPassword,
});

export type ChangePasswordBody = z.output<typeof changePasswordBody>;

/**
 * Erasing one's own account. The password proves it is the owner at the keyboard,
 * not someone at an unlocked device; the literal confirmation guards a mis-tap.
 */
export const ERASE_CONFIRMATION = "DELETE";

export const eraseAccountBody = z.strictObject({
  password: z
    .string()
    .min(1)
    .refine(
      (value) => passwordLength(value) <= PASSWORD_MAX_LENGTH,
      `must be at most ${PASSWORD_MAX_LENGTH} characters`,
    ),
  confirmation: z.literal(ERASE_CONFIRMATION),
});

export type EraseAccountBody = z.output<typeof eraseAccountBody>;

/** What a person types for a code: digits, maybe spaced or Arabic-Indic. otp-policy.ts normalizes it. */
const MAX_CODE_INPUT_LENGTH = 16;
const codeInput = z.string().trim().min(1).max(MAX_CODE_INPUT_LENGTH);

export const confirmEmailBody = z.strictObject({ code: codeInput });
export type ConfirmEmailBody = z.output<typeof confirmEmailBody>;

export const forgotPasswordBody = z.strictObject({ email, captchaToken });
export type ForgotPasswordBody = z.output<typeof forgotPasswordBody>;

export const resetPasswordBody = z.strictObject({ email, code: codeInput, newPassword });
export type ResetPasswordBody = z.output<typeof resetPasswordBody>;
