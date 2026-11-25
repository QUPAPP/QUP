import { Inject, Injectable } from "@nestjs/common";

import { CaptchaFailed, CaptchaUnavailable } from "../domain/auth.errors.js";
import {
  CAPTCHA_ACTIONS,
  CAPTCHA_VERIFIER,
  type CaptchaAction,
  type CaptchaVerifier,
} from "../domain/captcha.js";

/**
 * The human check before a form anyone may submit (domain/captcha.ts). Off,
 * it lets everything through; on, a missing or rejected token stops the
 * request before any account is touched or any mail is sent.
 */
@Injectable()
export class HumanCheckService {
  constructor(@Inject(CAPTCHA_VERIFIER) private readonly verifier: CaptchaVerifier) {}

  get enabled(): boolean {
    return this.verifier.enabled;
  }

  async assert(
    token: string | undefined,
    action: CaptchaAction,
    remoteIp: string | null,
  ): Promise<void> {
    if (!this.verifier.enabled) return;
    if (!token) throw new CaptchaFailed();
    const verdict = await this.verifier.verify(token, CAPTCHA_ACTIONS[action], remoteIp);
    if (verdict === "UNAVAILABLE") throw new CaptchaUnavailable();
    if (verdict === "FAILED") throw new CaptchaFailed();
  }
}
