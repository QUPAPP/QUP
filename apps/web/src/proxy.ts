import { type NextRequest, NextResponse } from "next/server";

import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";

/**
 * Gives every page a fresh nonce and its Content Security Policy (C4). Next.js
 * reads the policy from the request headers while rendering and puts the nonce
 * on its scripts; the root layout renders per request so that it can.
 */
export function proxy(request: NextRequest): NextResponse {
  const policy = buildContentSecurityPolicy({
    nonce: createNonce(),
    development: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API proxy, build assets, or files from public/.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|brand/|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
