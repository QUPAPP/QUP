import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";

import { actorFrom } from "../../../common/http/actor-context.js";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe.js";
import { APP_CONFIG, type AppConfig } from "../../../config/app-config.js";
import { CredentialEndpoint } from "../../../infrastructure/rate-limit/rate-limit.module.js";
import { AuthService, type ClientContext } from "../application/auth.service.js";
import { HumanCheckService } from "../application/human-check.service.js";
import { OtpService } from "../application/otp.service.js";
import type { UserProfile } from "../domain/ports.js";
import type { Principal } from "../domain/principal.js";
import {
  type AcceptTermsBody,
  acceptTermsBody,
  type ChangePasswordBody,
  type ConfirmEmailBody,
  changePasswordBody,
  confirmEmailBody,
  type EraseAccountBody,
  eraseAccountBody,
  type ForgotPasswordBody,
  forgotPasswordBody,
  type LoginBody,
  loginBody,
  type RegisterBody,
  type ResetPasswordBody,
  registerBody,
  resetPasswordBody,
  type UpdateProfileBody,
  updateProfileBody,
} from "./auth.dto.js";
import { CurrentPrincipal } from "./current-principal.decorator.js";
import { Public } from "./public.decorator.js";
import { clearSessionCookie, setSessionCookie } from "./session-cookie.js";

/** Response shape for a user. Never includes the password hash or internal fields. */
interface PublicUser {
  id: string;
  email: string | null;
  /** True once the person proved they can read mail sent to `email` (one-time code). */
  emailVerified: boolean;
  /** The terms-and-privacy version the person last accepted; null before consent was recorded. */
  acceptedTermsVersion: string | null;
  phone: string | null;
  displayName: string | null;
  createdAt: string;
}

function toPublicUser(user: UserProfile): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    acceptedTermsVersion: user.termsVersion,
    phone: user.phone,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

function clientContext(request: FastifyRequest): ClientContext {
  return {
    userAgent: request.headers["user-agent"] ?? null,
    ipAddress: request.clientAddress || request.ip || null,
  };
}

/** API_CONTRACTS.md "Auth". */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly humanCheck: HumanCheckService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get("sign-up-options")
  @Public()
  @ApiOperation({
    summary: "What the public forms need before they are sent: the human-check site key, if any.",
  })
  signUpOptions(): { captchaSiteKey: string | null } {
    return { captchaSiteKey: this.config.captcha?.siteKey ?? null };
  }

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
    const client = clientContext(request);
    const { captchaToken, ...command } = body;
    await this.humanCheck.assert(captchaToken, "register", client.ipAddress);
    const { user, session } = await this.auth.register(command, client);
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
    /** What this deployment can do for the account; lets the app hide what would only fail. */
    features: { emailCodes: boolean };
  }> {
    const current = await this.auth.currentUser(principal);
    return {
      ...current,
      user: toPublicUser(current.user),
      features: { emailCodes: this.otp.enabled },
    };
  }

  @Post("sessions/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Sign out every other device; the current session stays active." })
  async revokeOtherSessions(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.auth.revokeOtherSessions(principal);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update the signed-in user's display name." })
  async updateProfile(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(updateProfileBody)) body: UpdateProfileBody,
  ): Promise<{ user: PublicUser }> {
    const user = await this.auth.updateProfile(principal, body.displayName);
    return { user: toPublicUser(user) };
  }

  @Post("terms")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Accept the terms and privacy policy as they read now (after they were updated).",
  })
  async acceptTerms(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(acceptTermsBody)) body: AcceptTermsBody,
  ): Promise<{ user: PublicUser }> {
    return {
      user: toPublicUser(await this.auth.acceptTerms(principal, body.acceptedTermsVersion)),
    };
  }

  @Post("password")
  @CredentialEndpoint()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Change the password; every other session is signed out." })
  async changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(changePasswordBody)) body: ChangePasswordBody,
  ): Promise<void> {
    await this.auth.changePassword(principal, body);
  }

  @Post("me/erase")
  @CredentialEndpoint()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete the signed-in account for good; every session ends.",
    description:
      'Needs the password and `confirmation: "DELETE"`. Email, phone, name and password are erased; payments and anonymous learning evidence stay. 422 CURRENT_PASSWORD_INCORRECT, or STAFF_ACCOUNT_CANNOT_BE_ERASED for an account with staff roles.',
  })
  async eraseAccount(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(eraseAccountBody)) body: EraseAccountBody,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.eraseOwnAccount(principal, body.password, actorFrom(request));
    clearSessionCookie(reply, this.config);
  }

  @Post("email/verification")
  @CredentialEndpoint()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Mail a one-time code to the signed-in user's email address, to verify it.",
    description:
      "429 CODE_REQUESTED_TOO_OFTEN (details.retryAfterSeconds) when asked again within a minute or more than five times an hour. 503 EMAIL_NOT_CONFIGURED / EMAIL_UNAVAILABLE.",
  })
  async requestEmailVerification(@CurrentPrincipal() principal: Principal) {
    return this.otp.requestEmailVerification(principal);
  }

  @Post("email/verify")
  @CredentialEndpoint()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Verify the signed-in user's email address with the mailed code.",
    description:
      "400 INVALID_OR_EXPIRED_CODE for a wrong, expired or burned code (five wrong guesses burn it).",
  })
  async confirmEmail(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(confirmEmailBody)) body: ConfirmEmailBody,
  ): Promise<void> {
    await this.otp.confirmEmail(principal, body.code);
  }

  @Post("password/forgot")
  @Public()
  @CredentialEndpoint()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Mail a password-reset code to an address.",
    description:
      "Answers the same whether or not the address belongs to an account, so it cannot be used to find out who is registered.",
  })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordBody)) body: ForgotPasswordBody,
    @Req() request: FastifyRequest,
  ) {
    await this.humanCheck.assert(
      body.captchaToken,
      "forgot-password",
      clientContext(request).ipAddress,
    );
    return this.otp.requestPasswordReset(body.email);
  }

  @Post("password/reset")
  @Public()
  @CredentialEndpoint()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Set a new password with the mailed code. Every session is signed out.",
    description: "400 INVALID_OR_EXPIRED_CODE for anything that is not a live, correct code.",
  })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordBody)) body: ResetPasswordBody,
  ): Promise<void> {
    await this.otp.resetPassword(body);
  }
}
