import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { NotAuthenticated } from "../domain/auth.errors.js";
import type { Principal } from "../domain/principal.js";

/**
 * Injects the authenticated caller. Handlers take identity from here — never
 * from a `studentId` in the body or URL (SECURITY.md: prevent IDOR).
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;
    if (!principal) throw new NotAuthenticated();
    return principal;
  },
);
