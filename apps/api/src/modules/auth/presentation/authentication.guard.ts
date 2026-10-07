import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { AuthService } from "../application/auth.service.js";
import { NotAuthenticated } from "../domain/auth.errors.js";
import { IS_PUBLIC } from "./public.decorator.js";
import { readSessionToken } from "./session-cookie.js";

/**
 * Global guard: every route needs a valid session unless marked @Public().
 * On success the caller is attached as `request.principal`.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = readSessionToken(request, this.config);
    if (!token) throw new NotAuthenticated();

    request.principal = await this.auth.authenticate(token);
    return true;
  }
}
