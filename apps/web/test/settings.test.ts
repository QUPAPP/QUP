import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/lib/api";
import { errorMessage } from "../src/lib/messages";
import { LEVELS_KEY, listSettings, updateSetting } from "../src/lib/settings-api";
import { formFromLevels, levelsFormSchema, toLevelsValue } from "../src/lib/settings-form";

afterEach(() => vi.unstubAllGlobals());

const levels = (...from: number[]) =>
  ["NEEDS_FOUNDATION", "BEGINNER", "INTERMEDIATE", "GOOD", "ADVANCED"].map((level, index) => ({
    level,
    fromPercentage: from[index] ?? 0,
  }));

describe("settings client", () => {
  it("lists settings", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal("fetch", request);
    await listSettings();
    expect(request).toHaveBeenCalledWith("/api/v1/admin/settings", expect.anything());
  });

  it("saves the next version with the version it was read at", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ version: 3 }));
    vi.stubGlobal("fetch", request);
    await updateSetting(LEVELS_KEY, { expectedVersion: 2, value: levels(0, 40, 55, 70, 85) });
    expect(request).toHaveBeenCalledWith(
      `/api/v1/admin/settings/${LEVELS_KEY}`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ expectedVersion: 2, value: levels(0, 40, 55, 70, 85) }),
      }),
    );
  });
});

describe("level boundaries form", () => {
  it("round-trips the boundaries", () => {
    expect(toLevelsValue(formFromLevels(levels(0, 40, 55, 70, 85)))).toEqual(
      levels(0, 40, 55, 70, 85),
    );
  });

  it("accepts Arabic-Indic digits", () => {
    const parsed = levelsFormSchema.parse({ boundaries: ["0", "٣٥", "50", "65", "80"] });
    expect(toLevelsValue(parsed)).toEqual(levels(0, 35, 50, 65, 80));
  });

  it("rejects fractions and values above 100, leaving order rules to the API", () => {
    expect(
      levelsFormSchema.safeParse({ boundaries: ["0", "40.5", "55", "70", "85"] }).success,
    ).toBe(false);
    expect(levelsFormSchema.safeParse({ boundaries: ["0", "40", "55", "70", "101"] }).success).toBe(
      false,
    );
    expect(levelsFormSchema.safeParse({ boundaries: ["0", "60", "55", "70", "85"] }).success).toBe(
      true,
    );
  });

  it.each(["SETTING_VALUE_INVALID", "SETTING_VERSION_CONFLICT", "SETTING_NOT_FOUND"])(
    "explains %s in Arabic",
    (code) => {
      const message = errorMessage(new ApiError(409, code, "server text", null));
      expect(message).toMatch(/[؀-ۿ]/);
      expect(message).not.toBe(errorMessage(new ApiError(500, "UNKNOWN", "x", null)));
    },
  );
});
