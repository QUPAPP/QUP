import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../config/app-config.js";
import { EmailModule } from "../email/email.module.js";
import { AdminBootstrapService } from "./application/admin-bootstrap.service.js";
import { AuthService } from "./application/auth.service.js";
import { HumanCheckService } from "./application/human-check.service.js";
import { OtpService } from "./application/otp.service.js";
import { ACCOUNT_ERASURE, type AccountErasure, USER_DIRECTORY } from "./auth.contract.js";
import { CAPTCHA_VERIFIER, type CaptchaVerifier, NO_CAPTCHA } from "./domain/captcha.js";
import {
  AUTH_STORE,
  type AuthStore,
  CLOCK,
  type Clock,
  OTP_STORE,
  PASSWORD_HASHER,
} from "./domain/ports.js";
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import { DrizzleAuthStore } from "./infrastructure/drizzle-auth-store.js";
import { DrizzleOtpStore } from "./infrastructure/drizzle-otp-store.js";
import { DrizzleUserDirectory } from "./infrastructure/drizzle-user-directory.js";
import { TurnstileCaptcha } from "./infrastructure/turnstile-captcha.js";
import { AuthController } from "./presentation/auth.controller.js";

const systemClock: Clock = { now: () => new Date() };

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    AdminBootstrapService,
    HumanCheckService,
    {
      provide: CAPTCHA_VERIFIER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): CaptchaVerifier =>
        config.captcha
          ? new TurnstileCaptcha({
              secretKey: config.captcha.secretKey,
              expectedHostname: config.captcha.expectedHostname,
            })
          : NO_CAPTCHA,
    },
    { provide: AUTH_STORE, useClass: DrizzleAuthStore },
    { provide: OTP_STORE, useClass: DrizzleOtpStore },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: CLOCK, useValue: systemClock },
    { provide: USER_DIRECTORY, useClass: DrizzleUserDirectory },
    {
      provide: ACCOUNT_ERASURE,
      inject: [AUTH_STORE, CLOCK],
      useFactory: (store: AuthStore, clock: Clock): AccountErasure => ({
        erase: (userId, actor) => store.eraseAccount(userId, actor, clock.now()),
      }),
    },
  ],
  exports: [AuthService, AdminBootstrapService, USER_DIRECTORY, ACCOUNT_ERASURE],
})
export class AuthModule {}
