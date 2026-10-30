import { afterEach, describe, expect, it, vi } from "vitest";

import { grantEntitlement, lookupStudent, updatePlan } from "../src/lib/billing-admin-api";
import {
  durationText,
  fromMinorUnits,
  grantFormSchema,
  planFormSchema,
  toDurationDays,
  toMinorUnits,
} from "../src/lib/billing-form";

afterEach(() => vi.unstubAllGlobals());

describe("plan form", () => {
  it("converts riyals to halalas without floating point drift", () => {
    expect(toMinorUnits("199")).toBe(19900);
    expect(toMinorUnits("0.1")).toBe(10);
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(fromMinorUnits(19900)).toBe("199");
    expect(fromMinorUnits(1999)).toBe("19.99");
    expect(fromMinorUnits(1905)).toBe("19.05");
  });

  it("accepts Arabic-Indic digits and upper-cases the code", () => {
    const parsed = planFormSchema.parse({
      examId: "e1",
      code: "qudurat-90",
      name: "باقة",
      price: "١٩٩٫٥",
      durationDays: "٩٠",
    });
    expect(parsed).toMatchObject({ code: "QUDURAT-90", price: "199.5", durationDays: "90" });
    expect(toMinorUnits(parsed.price)).toBe(19950);
    expect(toDurationDays(parsed.durationDays)).toBe(90);
  });

  it("treats an empty duration as access without an end, and rejects nonsense", () => {
    expect(
      toDurationDays(grantFormSchema.parse({ examId: "e1", durationDays: "" }).durationDays),
    ).toBeNull();
    expect(grantFormSchema.safeParse({ examId: "e1", durationDays: "0" }).success).toBe(false);
    expect(
      planFormSchema.safeParse({
        examId: "e1",
        code: "A",
        name: "x",
        price: "1.234",
        durationDays: "",
      }).success,
    ).toBe(false);
  });

  it("words durations in Arabic", () => {
    expect(durationText(null)).toBe("بلا نهاية");
    expect(durationText(1)).toBe("يوم واحد");
    expect(durationText(7)).toBe("7 أيام");
    expect(durationText(90)).toBe("90 يومًا");
  });
});

describe("billing admin client", () => {
  it("calls the billing admin routes", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({}));
    vi.stubGlobal("fetch", request);
    await lookupStudent("a+b@x.com");
    await updatePlan("p1", { priceMinor: 100 });
    await grantEntitlement({ studentId: "s1", examId: "e1", durationDays: null });
    expect(request.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["/api/v1/admin/students/lookup?identifier=a%2Bb%40x.com", "GET"],
      ["/api/v1/admin/plans/p1", "PATCH"],
      ["/api/v1/admin/entitlements", "POST"],
    ]);
  });
});
