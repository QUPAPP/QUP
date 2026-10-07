import { randomUUID } from "node:crypto";

/**
 * Request correlation (API_CONTRACTS.md "request IDs", OBSERVABILITY.md).
 *
 * An upstream proxy may supply its own ID so traces line up end to end, but
 * only if it is short and made of safe characters — anything else is replaced,
 * so a client cannot inject newlines or control characters into the logs.
 */

export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate !== undefined && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}
