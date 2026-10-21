import { describe, expect, it } from "vitest";

import {
  compareMeasurements,
  fullReassessmentStatus,
} from "../../src/modules/assessments/domain/full-reassessment.js";

/** PRD §8, WORKFLOWS.md §6: a configurable cooldown and training attempts; OPEN_QUESTIONS.md #12g. */

const gate = { cooldownDays: 7, minTrainingAttempts: 30 };
const measuredAt = new Date("2026-10-01T10:00:00.000Z");
const weekLater = new Date("2026-10-08T10:00:00.000Z");

const status = (overrides: Partial<Parameters<typeof fullReassessmentStatus>[0]>) =>
  fullReassessmentStatus({
    hasAccess: true,
    openSessionId: null,
    lastMeasuredAt: measuredAt,
    trainingAttemptsSince: 30,
    now: weekLater,
    gate,
    ...overrides,
  });

describe("full re-diagnostic status", () => {
  it("lets an open session be resumed whatever else holds", () => {
    expect(status({ openSessionId: "s1", hasAccess: false, trainingAttemptsSince: 0 }).state).toBe(
      "OPEN",
    );
  });

  it("needs paid access", () => {
    expect(status({ hasAccess: false }).state).toBe("REQUIRES_ACCESS");
  });

  it("needs a full diagnostic first", () => {
    expect(status({ lastMeasuredAt: null, trainingAttemptsSince: 0 })).toEqual({
      state: "FULL_DIAGNOSTIC_REQUIRED",
      availableAt: null,
      attemptsRemaining: 30,
    });
  });

  it("opens exactly when the cooldown ends and the attempts are reached", () => {
    expect(status({})).toEqual({ state: "ELIGIBLE", availableAt: weekLater, attemptsRemaining: 0 });
  });

  it("waits until the cooldown ends", () => {
    const early = new Date(weekLater.getTime() - 1);
    expect(status({ now: early })).toEqual({
      state: "WAITING",
      availableAt: weekLater,
      attemptsRemaining: 0,
    });
  });

  it("waits for the remaining training answers", () => {
    expect(status({ trainingAttemptsSince: 29 })).toEqual({
      state: "WAITING",
      availableAt: weekLater,
      attemptsRemaining: 1,
    });
  });

  it("has no gate when both values are 0", () => {
    expect(
      status({
        now: measuredAt,
        trainingAttemptsSince: 0,
        gate: { cooldownDays: 0, minTrainingAttempts: 0 },
      }).state,
    ).toBe("ELIGIBLE");
  });
});

describe("compareMeasurements", () => {
  const current = [
    { skillId: "s1", outcome: "CORRECT" as const },
    { skillId: "s1", outcome: "INCORRECT" as const },
    { skillId: "s2", outcome: "NOT_ANSWERED" as const },
  ];

  it("counts correct answers out of all items, now and before, per skill", () => {
    const previous = [
      { skillId: "s1", outcome: "CORRECT" as const },
      { skillId: "s3", outcome: "CORRECT" as const },
    ];
    expect(compareMeasurements(current, previous)).toEqual({
      score: { correct: 1, total: 3 },
      previous: { correct: 2, total: 2 },
      skills: [
        { skillId: "s1", correct: 1, total: 2, previousCorrect: 1, previousTotal: 1 },
        { skillId: "s2", correct: 0, total: 1, previousCorrect: 0, previousTotal: 0 },
        { skillId: "s3", correct: 0, total: 0, previousCorrect: 1, previousTotal: 1 },
      ],
    });
  });

  it("has no previous numbers without a previous measurement", () => {
    const comparison = compareMeasurements(current, null);
    expect(comparison.previous).toBeNull();
    expect(comparison.skills.map((s) => [s.previousCorrect, s.previousTotal])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
});
