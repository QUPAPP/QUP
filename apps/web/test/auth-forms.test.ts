import { describe, expect, it } from "vitest";

import {
  loginForm,
  normalizeIdentifier,
  normalizePhone,
  registerForm,
} from "../src/lib/auth-forms";

describe("normalizePhone", () => {
  it.each([
    ["0501234567", "+966501234567"],
    ["050 123 4567", "+966501234567"],
    ["050-123-4567", "+966501234567"],
    ["501234567", "+966501234567"],
    ["966501234567", "+966501234567"],
    ["00966501234567", "+966501234567"],
    ["+966501234567", "+966501234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+966501234567"],
    ["۰۵۰۱۲۳۴۵۶۷", "+966501234567"],
    ["+201001234567", "+201001234567"],
  ])("reads %s as %s", (typed, expected) => {
    expect(normalizePhone(typed)).toBe(expected);
  });

  it("leaves what it cannot place for the API to judge", () => {
    expect(normalizePhone("12345")).toBe("12345");
  });
});

describe("sign-in identifier", () => {
  it("keeps an email as typed and normalizes a phone", () => {
    expect(normalizeIdentifier(" a@b.sa ")).toBe("a@b.sa");
    expect(loginForm.parse({ identifier: "0501234567", password: "x" }).identifier).toBe(
      "+966501234567",
    );
  });
});

describe("sign-up phone", () => {
  it("accepts the local Saudi form", () => {
    const form = registerForm.parse({
      displayName: "",
      email: "",
      phone: "0501234567",
      password: "a long enough password",
    });
    expect(form.phone).toBe("+966501234567");
  });

  it("still refuses a number it cannot read", () => {
    expect(
      registerForm.safeParse({
        displayName: "",
        email: "",
        phone: "123",
        password: "a long enough password",
      }).success,
    ).toBe(false);
  });
});
