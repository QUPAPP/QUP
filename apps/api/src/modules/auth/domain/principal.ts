import type { Permission } from "../../rbac/permissions.js";

/** The authenticated caller, resolved from the session cookie on every request. */
export interface Principal {
  userId: string;
  sessionId: string;
  roles: readonly string[];
  permissions: ReadonlySet<Permission>;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by AuthenticationGuard; absent on public routes. */
    principal?: Principal;
  }
}
