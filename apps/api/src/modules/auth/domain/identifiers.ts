/**
 * Sign-in identifiers (OPEN_QUESTIONS.md #6, decided 2026-09-22): a user has an
 * email, a phone, or both, and signs in with either.
 *
 * Normalization must match the database CHECK constraints in
 * 0002_users_identity_rules: emails trimmed and lower-cased, phones in E.164.
 * Phones are not reformatted here — "0501234567" is ambiguous without a
 * country, so the client sends E.164 and the server only validates it.
 */

export const E164_PHONE = /^\+[1-9][0-9]{7,14}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type SignInIdentifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

/** Classifies what the user typed in the single "email or phone" field. */
export function parseSignInIdentifier(raw: string): SignInIdentifier | null {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) return { kind: "email", value: normalizeEmail(trimmed) };
  if (E164_PHONE.test(trimmed)) return { kind: "phone", value: trimmed };
  return null;
}
