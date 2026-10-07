import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../../../config/app-config.js";
import type { IssuedSession } from "../application/auth.service.js";

/**
 * Session cookie (SECURITY.md "Authentication"):
 *  - HttpOnly: page scripts cannot read it, so XSS cannot exfiltrate it;
 *  - Secure + `__Host-` prefix in production: HTTPS only, bound to this exact
 *    host, cannot be set or shadowed by a sibling subdomain;
 *  - SameSite=Lax: not sent on cross-site POSTs. Together with JSON-only
 *    bodies (a cross-site form cannot send application/json without a CORS
 *    preflight, which the allowlist refuses) this is the CSRF defence.
 */

const SECURE_COOKIE_NAME = "__Host-qup_session";
const LOCAL_COOKIE_NAME = "qup_session";

export function sessionCookieName(config: AppConfig): string {
  return config.session.secureCookie ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;
}

export function readSessionToken(request: FastifyRequest, config: AppConfig): string | undefined {
  return request.cookies[sessionCookieName(config)] || undefined;
}

export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  session: IssuedSession,
): void {
  reply.setCookie(sessionCookieName(config), session.token, {
    httpOnly: true,
    secure: config.session.secureCookie,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(sessionCookieName(config), {
    httpOnly: true,
    secure: config.session.secureCookie,
    sameSite: "lax",
    path: "/",
  });
}
