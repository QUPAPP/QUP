import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

import type { FastifyInstance } from "fastify";

/**
 * Who a request comes from, for per-client limits (SECURITY.md "rate
 * limiting"). Students reach the API through the web app, so every request
 * arrives from its address. The web app therefore names the student's address,
 * and proves it is the web app with a shared secret. Anything else is judged
 * by the socket and the trusted proxy hops (TRUST_PROXY), never by headers
 * the client wrote.
 */

export const PROXY_SECRET_HEADER = "x-qup-proxy-secret";
export const CLIENT_IP_HEADER = "x-qup-client-ip";

declare module "fastify" {
  interface FastifyRequest {
    /** The client this request is counted against. Set for every request. */
    clientAddress: string;
  }
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

/** Compares digests so neither the length nor the content leaks through timing. */
function sameSecret(presented: string, secret: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

export function resolveClientAddress(
  request: { ip: string; headers: IncomingHttpHeaders },
  sharedSecret: string | null,
): string {
  if (sharedSecret === null) return request.ip;
  const presented = single(request.headers[PROXY_SECRET_HEADER]);
  const claimed = single(request.headers[CLIENT_IP_HEADER])?.trim();
  if (presented === undefined || claimed === undefined) return request.ip;
  if (!sameSecret(presented, sharedSecret) || isIP(claimed) === 0) return request.ip;
  return claimed;
}

export function registerClientAddress(fastify: FastifyInstance, sharedSecret: string | null): void {
  fastify.decorateRequest("clientAddress", "");
  fastify.addHook("onRequest", async (request) => {
    request.clientAddress = resolveClientAddress(request, sharedSecret);
  });
}
