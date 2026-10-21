import type { NextRequest } from "next/server";

import { forwardedRequestHeaders, forwardedResponseHeaders, upstreamUrl } from "@/lib/api-proxy";

/**
 * Same-origin gateway to the QUP API. Runs on the server at request time, so
 * API_INTERNAL_URL is read from the environment of the running container.
 */

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_DEV_API_URL = "http://localhost:3000";
const NO_CONTENT = 204;

function apiBaseUrl(): string {
  const configured = process.env.API_INTERNAL_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("API_INTERNAL_URL is required in production.");
  }
  return DEFAULT_DEV_API_URL;
}

/**
 * Lets the API count each student separately (PROXY_SHARED_SECRET, shared
 * with the API). Without it in production every student would share this
 * server's address and its rate limits, so its absence is an error there.
 */
function proxySecret(): string | null {
  const configured = process.env.PROXY_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PROXY_SHARED_SECRET is required in production.");
  }
  return null;
}

/** Same envelope as the API's own errors, so the client handles one shape. */
function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message, requestId: null } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = upstreamUrl(apiBaseUrl(), path, request.nextUrl.search);
  if (!target) return errorResponse(404, "NOT_FOUND", "The requested resource was not found.");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: forwardedRequestHeaders(request.headers, proxySecret()),
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    // The API is down or slow: answer in its own error shape rather than a bare 500.
    return errorResponse(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.");
  }

  return new Response(upstream.status === NO_CONTENT ? null : upstream.body, {
    status: upstream.status,
    headers: forwardedResponseHeaders(upstream.headers),
  });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
