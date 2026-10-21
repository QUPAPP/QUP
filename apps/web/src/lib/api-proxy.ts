/**
 * What the API proxy forwards, as pure functions (tested in test/api-proxy.test.ts).
 *
 * Allow-lists, not deny-lists: a header or path is forwarded because it is
 * named here. The target host is configuration and never comes from the
 * request, so the proxy cannot be pointed somewhere else (SECURITY.md: SSRF).
 */

import { isIP } from "node:net";

/** Request headers the API needs from the browser. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "cookie",
  "idempotency-key",
  "user-agent",
  "x-request-id",
] as const;

/** The API trusts the client address only alongside the shared secret (PROXY_SHARED_SECRET). */
export const PROXY_SECRET_HEADER = "x-qup-proxy-secret";
export const CLIENT_IP_HEADER = "x-qup-client-ip";

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

/**
 * The address of the client this app is serving: the right-most
 * X-Forwarded-For entry, appended by the edge proxy in front of this app (or
 * filled from the socket by Next.js when there is none). Entries to its left
 * were written by the client and are never used.
 */
export function clientAddress(incoming: Headers): string | null {
  const entries = incoming.get("x-forwarded-for")?.split(",") ?? [];
  const nearest = entries.at(-1)?.trim() ?? "";
  return isIP(nearest) === 0 ? null : nearest;
}

/**
 * Headers for the API. The browser's own X-Forwarded-For never passes: the
 * API rate-limits per client, and that header is whatever the client wants.
 * With the shared secret, this app names the client it is serving instead.
 */
export function forwardedRequestHeaders(incoming: Headers, proxySecret: string | null): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (proxySecret !== null) {
    headers.set(PROXY_SECRET_HEADER, proxySecret);
    const client = clientAddress(incoming);
    if (client !== null) headers.set(CLIENT_IP_HEADER, client);
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
