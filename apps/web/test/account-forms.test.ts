import { afterEach, describe, expect, it, vi } from "vitest";
import { changePassword, updateProfile } from "../src/lib/api";
import { passwordForm, profileForm } from "../src/lib/auth-forms";

afterEach(() => vi.unstubAllGlobals());

describe("password form", () => {
  const valid = {
    currentPassword: "old passphrase here",
    newPassword: "a brand new passphrase",
    confirmPassword: "a brand new passphrase",
  };

  it("accepts a matching new password", () => {
    expect(passwordForm.safeParse(valid).success).toBe(true);
  });

  it("rejects a mismatched confirmation on the confirmation field", () => {
    const result = passwordForm.safeParse({ ...valid, confirmPassword: "something else" });
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("rejects a short or unchanged new password", () => {
    expect(
      passwordForm.safeParse({ ...valid, newPassword: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    const same = passwordForm.safeParse({
      ...valid,
      newPassword: valid.currentPassword,
      confirmPassword: valid.currentPassword,
    });
    expect(same.error?.issues[0]?.path).toEqual(["newPassword"]);
  });
});

describe("profile form", () => {
  it("trims the name and keeps the API's length limit", () => {
    expect(profileForm.parse({ displayName: "  سارة " }).displayName).toBe("سارة");
    expect(profileForm.safeParse({ displayName: "x".repeat(81) }).success).toBe(false);
  });
});

describe("account client", () => {
  it("sends profile and password changes as cookie-authenticated writes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user: { id: "u", displayName: "سارة" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    await updateProfile({ displayName: "سارة" });
    await changePassword({ currentPassword: "a", newPassword: "b" });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/me",
      expect.objectContaining({ method: "PATCH", credentials: "same-origin" }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/password",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });
});
