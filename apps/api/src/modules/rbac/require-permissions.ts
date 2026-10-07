import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { NotAuthenticated, PermissionDenied } from "../auth/domain/auth.errors.js";
import type { Permission } from "./permissions.js";

export const REQUIRED_PERMISSIONS = "qup:requiredPermissions";

/**
 * Requires the caller to hold *every* listed permission. Enforced on the server
 * for each request; hiding a button in the UI is never the control
 * (AGENTS.md §3).
 */
export const RequirePermissions = (
  ...required: [Permission, ...Permission[]]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS, required);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;
    // A permission-protected route marked @Public() is a mistake; fail closed.
    if (!principal) throw new NotAuthenticated();
    if (!required.every((permission) => principal.permissions.has(permission))) {
      throw new PermissionDenied();
    }
    return true;
  }
}
