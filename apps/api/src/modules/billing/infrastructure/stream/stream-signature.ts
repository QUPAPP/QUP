import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stream webhook signatures (https://dev-docs.streampay.sa/webhooks):
 *
 *   X-Webhook-Signature: t=<unix timestamp>,v1=<hex HMAC-SHA256>
 *   signed message      = "<timestamp>.<raw request body>"
 *
 * The body must be the exact bytes received: re-serialized JSON does not
 * produce the same signature.
 *
 * No timestamp tolerance is enforced, on purpose. Stream retries a delivery
 * for up to 12 hours and does not document whether a retry is re-signed, so a
 * tolerance could reject genuine retries. Replay is harmless instead: every
 * event is confirmed against Stream's API and every transition is idempotent.
 */

const HEX_SHA256 = /^[0-9a-f]{64}$/i;
const UNIX_TIMESTAMP = /^\d{1,15}$/;

function parseHeader(header: string): { timestamp: string; signature: string } | null {
  const parts = new Map<string, string>();
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) return null;
    parts.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return null;
  if (!UNIX_TIMESTAMP.test(timestamp) || !HEX_SHA256.test(signature)) return null;
  return { timestamp, signature };
}

export function isValidStreamSignature(
  secret: string,
  rawBody: Buffer,
  header: string | undefined,
): boolean {
  if (!header) return false;
  const parsed = parseHeader(header);
  if (!parsed) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.`)
    .update(rawBody)
    .digest();
  const given = Buffer.from(parsed.signature, "hex");
  // Lengths are equal by construction (64 hex chars), which timingSafeEqual requires.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** For tests and local tooling: the header Stream would send for this body. */
export function signStreamPayload(secret: string, rawBody: Buffer, timestamp: number): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
