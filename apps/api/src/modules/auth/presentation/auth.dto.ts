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

export const registerBody = z
  .strictObject({
    email: email.optional(),
    phone: phone.optional(),
    password: newPassword,
    displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: "provide an email, a phone number, or both",
    path: ["email"],
  });

export type RegisterBody = z.output<typeof registerBody>;

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
