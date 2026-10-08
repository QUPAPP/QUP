/**
 * What the API proxy forwards, as pure functions (tested in test/api-proxy.test.ts).
 *
 * Allow-lists, not deny-lists: a header or path is forwarded because it is
 * named here. The target host is configuration and never comes from the
 * request, so the proxy cannot be pointed somewhere else (SECURITY.md: SSRF).
 */

/** Request headers the API needs from the browser. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "cookie",
  "idempotency-key",
  "user-agent",
  "x-request-id",
  // The API rate-limits per client address; without this every student would share ours.
  "x-forwarded-for",
] as const;

/** Response headers the browser needs back. Set-Cookie is handled separately (it repeats). */
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "x-request-id"] as const;

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * The API path for the requested segments, or null when it must not be proxied.
 * Payment webhooks are for the provider, which calls the API itself; a browser
 * has no business reaching them through this app.
 */
export function upstreamPath(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;
  if (!segments.every((s) => SAFE_SEGMENT.test(s) && s !== "." && s !== "..")) return null;
  if (segments[0] === "payments" && segments[1] === "webhooks") return null;
  return `/api/v1/${segments.join("/")}`;
}

export function upstreamUrl(
  baseUrl: string,
  segments: readonly string[],
  search: string,
): URL | null {
  const path = upstreamPath(segments);
  if (path === null) return null;
  const url = new URL(path, baseUrl);
  url.search = search;
  return url;
}

export function forwardedRequestHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

export function forwardedResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  for (const cookie of upstream.getSetCookie()) headers.append("set-cookie", cookie);
  // Whatever the API said, nothing that passes through here is cacheable.
  headers.set("cache-control", "no-store");
  return headers;
}
