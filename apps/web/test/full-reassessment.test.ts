import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getFullReassessmentResult,
  getFullReassessmentStatus,
  startFullReassessment,
} from "../src/lib/api";
import {
  COMPLETION_LABELS,
  completionHref,
  isRunnable,
  SESSION_TITLES,
} from "../src/lib/diagnostics";
import {
  accuracyText,
  changeText,
  daysText,
  gateText,
  waitingLines,
} from "../src/lib/full-reassessment";
import { nextStepLink } from "../src/lib/next-step";
import { formFromGate, gateFormSchema, toGateValue } from "../src/lib/settings-form";

/** PRD §8 full re-diagnostic (API_CONTRACTS.md "Full re-diagnostic", OPEN_QUESTIONS.md #12g). */

afterEach(() => vi.unstubAllGlobals());

describe("full re-diagnostic client", () => {
  it("calls the re-diagnostic routes", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({}));
    vi.stubGlobal("fetch", request);
    await getFullReassessmentStatus("e1");
    await startFullReassessment("e1");
    await getFullReassessmentResult("s1");
    expect(request.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/v1/exams/e1/full-reassessment", "GET"],
      ["/api/v1/exams/e1/assessments/full-reassessment", "POST"],
      ["/api/v1/assessments/s1/full-reassessment-result", "GET"],
    ]);
  });
});

describe("in the runner and the dashboard", () => {
  it("runs, titles and ends on its comparison", () => {
    expect(isRunnable("FULL_REASSESSMENT")).toBe(true);
    expect(SESSION_TITLES.FULL_REASSESSMENT).toBe("إعادة التشخيص الشامل");
    expect(COMPLETION_LABELS.FULL_REASSESSMENT).toBe("عرض المقارنة");
    expect(completionHref({ id: "s1", examId: "e1", type: "FULL_REASSESSMENT" })).toBe(
      "/assessments/s1/full-reassessment",
    );
  });

  it("is the dashboard's next step once eligible", () => {
    expect(nextStepLink({ type: "START_FULL_REASSESSMENT" }, "e1")).toEqual({
      href: "/exams/e1/full-reassessment",
      label: "ابدأ إعادة التشخيص الشامل",
    });
  });
});

describe("texts", () => {
  it.each([
    [1, "يوم واحد"],
    [2, "يومين"],
    [3, "3 أيام"],
    [10, "10 أيام"],
    [11, "11 يومًا"],
  ])("counts %i days", (days, text) => {
    expect(daysText(days)).toBe(text);
  });

  it("states the gate in words", () => {
    expect(gateText(7, 30)).toBe(
      "تُتاح بعد مرور 7 أيام على آخر قياس كامل، ويلزم معها 30 إجابة في التدريب منذه.",
    );
    expect(gateText(2, 0)).toBe("تُتاح بعد مرور يومين على آخر قياس كامل.");
    expect(gateText(0, 2)).toBe("يلزم إجابتان في التدريب منذ آخر قياس كامل.");
    expect(gateText(0, 0)).toBe("");
  });

  it("says what is left before the re-diagnostic opens", () => {
    const now = new Date("2026-10-21T10:00:00.000Z");
    expect(
      waitingLines(
        {
          availableAt: "2026-10-23T09:00:00.000Z",
          trainingAttempts: { done: 18, required: 30 },
        },
        now,
      ),
    ).toEqual(["تُفتح بعد يومين من الآن.", "بقي 12 إجابة في التدريب."]);
    expect(
      waitingLines(
        { availableAt: "2026-10-20T10:00:00.000Z", trainingAttempts: { done: 29, required: 30 } },
        now,
      ),
    ).toEqual(["بقيت إجابة واحدة في التدريب."]);
  });

  it("shows accuracy as a percentage, and its change in points", () => {
    expect(accuracyText(3, 4)).toBe("75٪");
    expect(accuracyText(0, 0)).toBe("—");
    expect(changeText({ correct: 8, total: 10, previousCorrect: 5, previousTotal: 10 })).toBe(
      "+30 نقطة",
    );
    expect(changeText({ correct: 4, total: 10, previousCorrect: 5, previousTotal: 10 })).toBe(
      "−10 نقاط",
    );
    expect(changeText({ correct: 5, total: 10, previousCorrect: 1, previousTotal: 2 })).toBe(
      "دون تغيير",
    );
    expect(changeText({ correct: 2, total: 3, previousCorrect: 0, previousTotal: 0 })).toBe(
      "قيست لأول مرة",
    );
    expect(changeText({ correct: 0, total: 0, previousCorrect: 1, previousTotal: 2 })).toBe(
      "لم تُقس هذه المرة",
    );
  });
});

describe("gate setting form", () => {
  it("round-trips the setting, reading Arabic digits", () => {
    expect(formFromGate({ cooldownDays: 7, minTrainingAttempts: 30 })).toEqual({
      cooldownDays: "7",
      minTrainingAttempts: "30",
    });
    const parsed = gateFormSchema.parse({ cooldownDays: "٣", minTrainingAttempts: "20" });
    expect(toGateValue(parsed)).toEqual({ cooldownDays: 3, minTrainingAttempts: 20 });
  });

  it("asks for whole numbers", () => {
    expect(
      gateFormSchema.safeParse({ cooldownDays: "2.5", minTrainingAttempts: "1" }).success,
    ).toBe(false);
    expect(gateFormSchema.safeParse({ cooldownDays: "", minTrainingAttempts: "1" }).success).toBe(
      false,
    );
  });
});
