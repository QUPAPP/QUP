import { describe, expect, it } from "vitest";

import {
  DEFAULT_FULL_REASSESSMENT_GATE,
  DEFAULT_PRELIMINARY_LEVELS,
  FULL_REASSESSMENT_GATE_KEY,
  isSettingKey,
  PRELIMINARY_LEVELS_KEY,
  parseSettingValue,
} from "../../src/modules/settings/domain/setting-definitions.js";
import { SettingValueInvalid } from "../../src/modules/settings/domain/settings.errors.js";

const levels = (...fromPercentages: number[]) =>
  ["NEEDS_FOUNDATION", "BEGINNER", "INTERMEDIATE", "GOOD", "ADVANCED"].map((level, index) => ({
    level,
    fromPercentage: fromPercentages[index],
  }));

const parse = (value: unknown) => () => parseSettingValue(PRELIMINARY_LEVELS_KEY, value);

describe("preliminary result levels setting", () => {
  it("accepts the documented defaults (OPEN_QUESTIONS.md #10c)", () => {
    expect(parseSettingValue(PRELIMINARY_LEVELS_KEY, DEFAULT_PRELIMINARY_LEVELS)).toEqual(
      levels(0, 40, 55, 70, 85),
    );
  });

  it("accepts other increasing boundaries starting at 0", () => {
    expect(parse(levels(0, 30, 50, 65, 80))()).toEqual(levels(0, 30, 50, 65, 80));
  });

  it.each([
    ["the first band not starting at 0", levels(5, 40, 55, 70, 85)],
    ["boundaries not increasing", levels(0, 55, 40, 70, 85)],
    ["a repeated boundary", levels(0, 40, 40, 70, 85)],
    ["a fraction", levels(0, 40.5, 55, 70, 85)],
    ["more than 100", levels(0, 40, 55, 70, 101)],
    ["a missing level", levels(0, 40, 55, 70, 85).slice(0, 4)],
    [
      "levels out of order",
      [...levels(0, 40, 55, 70, 85)].map((band, index, all) =>
        index === 1 ? { ...band, level: "INTERMEDIATE" } : index === 2 ? all[1] : band,
      ),
    ],
  ])("rejects %s", (_name, value) => {
    expect(parse(value)).toThrow(SettingValueInvalid);
  });

  it("knows its keys only", () => {
    expect(isSettingKey(PRELIMINARY_LEVELS_KEY)).toBe(true);
    expect(isSettingKey("assessment.unknown")).toBe(false);
  });
});

describe("full re-diagnostic gate setting (PRD §8)", () => {
  const gate = (value: unknown) => () => parseSettingValue(FULL_REASSESSMENT_GATE_KEY, value);

  it("defaults to a 7-day cooldown and 30 training answers", () => {
    expect(isSettingKey(FULL_REASSESSMENT_GATE_KEY)).toBe(true);
    expect(DEFAULT_FULL_REASSESSMENT_GATE).toEqual({ cooldownDays: 7, minTrainingAttempts: 30 });
    expect(gate(DEFAULT_FULL_REASSESSMENT_GATE)()).toEqual(DEFAULT_FULL_REASSESSMENT_GATE);
  });

  it("accepts no gate at all", () => {
    expect(gate({ cooldownDays: 0, minTrainingAttempts: 0 })()).toEqual({
      cooldownDays: 0,
      minTrainingAttempts: 0,
    });
  });

  it.each([
    ["a negative cooldown", { cooldownDays: -1, minTrainingAttempts: 30 }],
    ["a cooldown over a year", { cooldownDays: 366, minTrainingAttempts: 30 }],
    ["a fractional count", { cooldownDays: 7, minTrainingAttempts: 2.5 }],
    ["too many attempts", { cooldownDays: 7, minTrainingAttempts: 1001 }],
    ["a missing field", { cooldownDays: 7 }],
    ["an unknown field", { cooldownDays: 7, minTrainingAttempts: 30, extra: 1 }],
  ])("refuses %s", (_name, value) => {
    expect(gate(value)).toThrow(SettingValueInvalid);
  });
});
