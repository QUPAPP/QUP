import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque session tokens (SECURITY.md "Authentication").
 *
 * 256 random bits go to the client in a cookie; only a SHA-256 digest is
 * stored. A plain fast hash is sufficient here — unlike passwords, the token
 * has full entropy, so it cannot be brute-forced from its digest. A leaked
 * auth_sessions table therefore yields no usable session.
 */

const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
