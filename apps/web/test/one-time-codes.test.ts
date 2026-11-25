import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  confirmEmail,
  forgotPassword,
  requestEmailVerification,
  resetPassword,
} from "../src/lib/api";
import { codeForm, forgotForm, normalizeCodeInput, resetForm } from "../src/lib/auth-forms";
import { errorMessage } from "../src/lib/messages";
import { isWorkspacePath } from "../src/lib/navigation";
import { retryAfterSeconds, secondsLeft } from "../src/lib/resend-countdown";

afterEach(() => vi.unstubAllGlobals());

describe("code input", () => {
  it.each([
    ["123456", "123456"],
    ["١٢٣٤٥٦", "123456"],
    ["۱۲۳۴۵۶", "123456"],
    [" 123 456 ", "123456"],
    ["123-456", "123456"],
    ["12ab34", "1234"],
    ["12345678", "123456"],
    ["", ""],
  ])("reads %j as %j", (typed, digits) => {
    expect(normalizeCodeInput(typed)).toBe(digits);
  });

  it("asks for exactly six digits", () => {
    expect(codeForm.safeParse({ code: "123456" }).success).toBe(true);
    expect(codeForm.parse({ code: "١٢٣ ٤٥٦" }).code).toBe("123456");
    for (const bad of ["", "12345", "abcdef"]) {
      expect(codeForm.safeParse({ code: bad }).success).toBe(false);
    }
  });
});

describe("forgot and reset forms", () => {
  it("lower-cases the address and rejects what is not one", () => {
    expect(forgotForm.parse({ email: "  Sara@Example.COM " }).email).toBe("sara@example.com");
    expect(forgotForm.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("needs the code, a long enough password and a matching confirmation", () => {
    const ok = {
      code: "123456",
      newPassword: "a long enough passphrase",
      confirmPassword: "a long enough passphrase",
    };
    expect(resetForm.safeParse(ok).success).toBe(true);
    expect(resetForm.safeParse({ ...ok, code: "12" }).success).toBe(false);
    expect(
      resetForm.safeParse({ ...ok, newPassword: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    expect(resetForm.safeParse({ ...ok, confirmPassword: "different passphrase!" }).success).toBe(
      false,
    );
  });
});

describe("resend countdown", () => {
  it("counts whole seconds up, never below zero", () => {
    expect(secondsLeft(60_000, 0)).toBe(60);
    expect(secondsLeft(60_000, 59_001)).toBe(1);
    expect(secondsLeft(60_000, 60_000)).toBe(0);
    expect(secondsLeft(60_000, 90_000)).toBe(0);
  });

  it("reads the wait out of the API's rate-limit error, and nothing else", () => {
    const limited = new ApiError(429, "CODE_REQUESTED_TOO_OFTEN", "x", { retryAfterSeconds: 42 });
    expect(retryAfterSeconds(limited)).toBe(42);
    expect(retryAfterSeconds(new ApiError(429, "CODE_REQUESTED_TOO_OFTEN", "x", null))).toBeNull();
    expect(retryAfterSeconds(new ApiError(400, "INVALID_OR_EXPIRED_CODE", "x", null))).toBeNull();
    expect(retryAfterSeconds(new Error("boom"))).toBeNull();
  });
});

describe("messages and routes", () => {
  it("has Arabic wording for every code the API can answer", () => {
    for (const code of [
      "INVALID_OR_EXPIRED_CODE",
      "CODE_REQUESTED_TOO_OFTEN",
      "EMAIL_REQUIRED",
      "EMAIL_ALREADY_VERIFIED",
      "EMAIL_NOT_CONFIGURED",
      "EMAIL_UNAVAILABLE",
    ]) {
      expect(errorMessage(new ApiError(400, code, "english developer text", null))).not.toBe(
        errorMessage(new ApiError(400, "SOMETHING_UNKNOWN", "x", null)),
      );
    }
  });

  it("keeps the verification page inside the student workspace", () => {
    expect(isWorkspacePath("/verify-email")).toBe(true);
    expect(isWorkspacePath("/forgot-password")).toBe(false);
  });
});

describe("one-time code client", () => {
  it("calls the code routes", async () => {
    const request = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ validForMinutes: 10, resendAfterSeconds: 60 }),
      );
    vi.stubGlobal("fetch", request);
    await requestEmailVerification();
    await confirmEmail("123456");
    await forgotPassword({ email: "a@x.com" });
    await resetPassword({
      email: "a@x.com",
      code: "123456",
      newPassword: "a long enough passphrase",
    });
    expect(request.mock.calls.map(([url, init]) => [url, init.method, init.body ?? null])).toEqual([
      ["/api/v1/auth/email/verification", "POST", null],
      ["/api/v1/auth/email/verify", "POST", JSON.stringify({ code: "123456" })],
      ["/api/v1/auth/password/forgot", "POST", JSON.stringify({ email: "a@x.com" })],
      [
        "/api/v1/auth/password/reset",
        "POST",
        JSON.stringify({
          email: "a@x.com",
          code: "123456",
          newPassword: "a long enough passphrase",
        }),
      ],
    ]);
  });
});
