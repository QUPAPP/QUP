/**
 * A human check on the forms anyone can submit without an account (sign-up,
 * "forgot password"): it makes throwaway accounts and code-mailing floods
 * expensive. Off unless configured (TURNSTILE_* variables); then the form must
 * carry a token the provider confirms.
 */
export type CaptchaAction = "register" | "forgot-password";

/** The action name the web widget is rendered with; a token solved for one form is refused on another. */
export const CAPTCHA_ACTIONS: Readonly<Record<CaptchaAction, CaptchaAction>> = Object.freeze({
  register: "register",
  "forgot-password": "forgot-password",
});

/** UNAVAILABLE: the provider could not be asked — not the person's fault. */
export type CaptchaVerdict = "PASSED" | "FAILED" | "UNAVAILABLE";

export interface CaptchaVerifier {
  readonly enabled: boolean;
  verify(token: string, action: CaptchaAction, remoteIp: string | null): Promise<CaptchaVerdict>;
}

export const CAPTCHA_VERIFIER = Symbol("CAPTCHA_VERIFIER");

/** When nothing is configured: every form passes, as before the check existed. */
export const NO_CAPTCHA: CaptchaVerifier = Object.freeze({
  enabled: false,
  verify: async () => "PASSED" as const,
});
