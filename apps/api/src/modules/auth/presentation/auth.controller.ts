import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { CredentialEndpoint } from "../../../infrastructure/rate-limit/rate-limit.module.js";
import { AuthService, type ClientContext } from "../application/auth.service.js";
import type { UserProfile } from "../domain/ports.js";
import type { Principal } from "../domain/principal.js";
import { type LoginBody, loginBody, type RegisterBody, registerBody } from "./auth.dto.js";
import { CurrentPrincipal } from "./current-principal.decorator.js";
import { Public } from "./public.decorator.js";
import { clearSessionCookie, setSessionCookie } from "./session-cookie.js";

/** Response shape for a user. Never includes the password hash or internal fields. */
interface PublicUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  createdAt: string;
}

function toPublicUser(user: UserProfile): PublicUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

function clientContext(request: FastifyRequest): ClientContext {
  return { userAgent: request.headers["user-agent"] ?? null, ipAddress: request.ip ?? null };
}

/** API_CONTRACTS.md "Auth". */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post("register")
  @Public()
  @CredentialEndpoint()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a student account with an email, a phone, or both." })
  async register(
    @Body(new ZodValidationPipe(registerBody)) body: RegisterBody,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: PublicUser }> {
    const { user, session } = await this.auth.register(body, clientContext(request));
    setSessionCookie(reply, this.config, session);
    return { user: toPublicUser(user) };
  }

  @Post("login")
  @Public()
  @CredentialEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in with an email or phone and a password." })
  async login(
    @Body(new ZodValidationPipe(loginBody)) body: LoginBody,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: PublicUser }> {
    const { user, session } = await this.auth.login(body, clientContext(request));
    setSessionCookie(reply, this.config, session);
    return { user: toPublicUser(user) };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "End the current session." })
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(principal);
    clearSessionCookie(reply, this.config);
  }

  @Get("me")
  @ApiOperation({ summary: "The signed-in user, with roles and permissions." })
  async me(@CurrentPrincipal() principal: Principal): Promise<{
    user: PublicUser;
    roles: string[];
    permissions: string[];
  }> {
    const current = await this.auth.currentUser(principal);
    return { ...current, user: toPublicUser(current.user) };
  }

  @Post("sessions/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Sign out every other device; the current session stays active." })
  async revokeOtherSessions(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.auth.revokeOtherSessions(principal);
  }
}
