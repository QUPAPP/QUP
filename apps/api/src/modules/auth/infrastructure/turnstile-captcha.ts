import type { CaptchaAction, CaptchaVerdict, CaptchaVerifier } from "../domain/captcha.js";

/** Cloudflare's server-side check of a Turnstile token. */
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** A sign-up waits on this; past it, the check counts as unavailable, not as a robot. */
const VERIFY_TIMEOUT_MS = 5_000;

export interface TurnstileConfig {
  secretKey: string;
  /** The site the widget must have been solved on (APP_PUBLIC_URL's host); null skips the check. */
  expectedHostname: string | null;
  /** For tests: where siteverify lives. */
  verifyUrl?: string;
}

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

/**
 * Cloudflare Turnstile (https://developers.cloudflare.com/turnstile/): the
 * token the widget gave the browser is sent to siteverify with our secret. A
 * token passes only if Cloudflare says so, for the same action (a sign-up
 * token cannot be replayed on another form) and the same site.
 */
export class TurnstileCaptcha implements CaptchaVerifier {
  readonly enabled = true;

  constructor(private readonly config: TurnstileConfig) {}

  async verify(
    token: string,
    action: CaptchaAction,
    remoteIp: string | null,
  ): Promise<CaptchaVerdict> {
    const form = new URLSearchParams({ secret: this.config.secretKey, response: token });
    if (remoteIp) form.set("remoteip", remoteIp);
    let body: SiteverifyResponse;
    try {
      const response = await fetch(this.config.verifyUrl ?? TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      if (!response.ok) return "UNAVAILABLE";
      body = (await response.json()) as SiteverifyResponse;
    } catch {
      // Network failure or timeout: Cloudflare could not be asked, the person did nothing wrong.
      return "UNAVAILABLE";
    }
    if (body.success !== true) return "FAILED";
    if (body.action !== undefined && body.action !== action) return "FAILED";
    if (
      this.config.expectedHostname !== null &&
      body.hostname !== undefined &&
      body.hostname !== this.config.expectedHostname
    ) {
      return "FAILED";
    }
    return "PASSED";
  }
}
