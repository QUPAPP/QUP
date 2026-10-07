import { describe, expect, it } from "vitest";

import { parseSignInIdentifier } from "../../src/modules/auth/domain/identifiers.js";
import { passwordLength } from "../../src/modules/auth/domain/password-policy.js";

describe("sign-in identifier", () => {
  it("normalizes emails so letter case and padding do not matter", () => {
    expect(parseSignInIdentifier("  Student@QUP.Test ")).toEqual({
      kind: "email",
      value: "student@qup.test",
    });
  });

  it("accepts E.164 phones as-is", () => {
    expect(parseSignInIdentifier("+966501234567")).toEqual({
      kind: "phone",
      value: "+966501234567",
    });
  });

  it("rejects local phone formats, which are ambiguous without a country", () => {
    expect(parseSignInIdentifier("0501234567")).toBeNull();
    expect(parseSignInIdentifier("966501234567")).toBeNull();
  });
});

describe("password length", () => {
  it("counts characters as users see them, including Arabic and emoji", () => {
    expect(passwordLength("كلمةمرور")).toBe(8);
    expect(passwordLength("🔐🔐")).toBe(2);
  });
});
