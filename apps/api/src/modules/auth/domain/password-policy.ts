/**
 * Password rules — OWASP ASVS 4.0.3:
 *   V2.1.1  at least 12 characters;
 *   V2.1.2  at least 64 allowed (we allow 128); the cap also bounds hashing cost,
 *           so an attacker cannot make Argon2 chew on a megabyte "password";
 *   V2.1.9  no composition rules (no forced symbols/digits/cases).
 *
 * Length is counted in Unicode code points so Arabic and emoji passwords are
 * measured the way the user perceives them.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordLength(password: string): number {
  return [...password].length;
}
