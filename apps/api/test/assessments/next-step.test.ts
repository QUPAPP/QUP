import { describe, expect, it } from "vitest";

import { type NextStepInput, nextStep } from "../../src/modules/assessments/domain/next-step.js";

/** UI_BRAND.md "Primary CTA = next recommended learning action"; OPEN_QUESTIONS.md #12f. */

const base: NextStepInput = {
  hasAccess: true,
  openSession: null,
  miniCompleted: true,
  fullCompleted: true,
  readySkill: null,
  fullReassessmentEligible: false,
  trainable: { any: true, topGapName: "الاستيعاب" },
};

describe("next step", () => {
  it.each([
    [
      "an open session comes first, even without access",
      { hasAccess: false, openSession: { id: "s1", type: "MINI_DIAGNOSTIC" as const } },
      { type: "RESUME_SESSION", sessionId: "s1", sessionType: "MINI_DIAGNOSTIC" },
    ],
    [
      "no access and no mini diagnostic yet",
      { hasAccess: false, miniCompleted: false, fullCompleted: false },
      { type: "START_MINI_DIAGNOSTIC" },
    ],
    ["no access after the mini diagnostic", { hasAccess: false }, { type: "SUBSCRIBE" }],
    [
      "paid without a full diagnostic, even with a ready skill",
      { fullCompleted: false, readySkill: { id: "k1", name: "التناظر" } },
      { type: "START_FULL_DIAGNOSTIC" },
    ],
    [
      "a ready skill before more training",
      { readySkill: { id: "k1", name: "التناظر" } },
      { type: "REASSESS", skillId: "k1", skillName: "التناظر" },
    ],
    [
      "a ready skill before the re-diagnostic",
      { readySkill: { id: "k1", name: "التناظر" }, fullReassessmentEligible: true },
      { type: "REASSESS", skillId: "k1", skillName: "التناظر" },
    ],
    [
      "the re-diagnostic once eligible, before more training (PRD §6)",
      { fullReassessmentEligible: true },
      { type: "START_FULL_REASSESSMENT" },
    ],
    [
      "the re-diagnostic rather than all mastered",
      { fullReassessmentEligible: true, trainable: { any: false, topGapName: null } },
      { type: "START_FULL_REASSESSMENT" },
    ],
    ["training on the top gap", {}, { type: "TRAIN", skillName: "الاستيعاب" }],
    [
      "training with no gap named",
      { trainable: { any: true, topGapName: null } },
      { type: "TRAIN", skillName: null },
    ],
    [
      "nothing left to train",
      { trainable: { any: false, topGapName: null } },
      { type: "ALL_MASTERED" },
    ],
  ] as const)("%s", (_name, overrides, expected) => {
    expect(nextStep({ ...base, ...overrides })).toEqual(expected);
  });
});
