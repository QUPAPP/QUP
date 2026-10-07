import type { FastifyRequest } from "fastify";

import type { ActorContext } from "../actor.js";

/** The acting user and request id, for audit entries. */
export function actorFrom(request: FastifyRequest): ActorContext {
  return { userId: request.principal?.userId ?? null, requestId: request.id };
}
