import { describe, expect, it } from "vitest";

import {
  answerKeyProblems,
  mappingProblems,
  structuralProblems,
} from "../../src/modules/questions/domain/content-rules.js";
import type {
  DraftContent,
  MappingDraft,
  OptionDraft,
} from "../../src/modules/questions/domain/question-content.js";
import { toStudentQuestionView } from "../../src/modules/questions/domain/student-view.js";

const text = (value: string) => ({ blocks: [{ type: "text" as const, text: value }] });

const options = (...correct: boolean[]): OptionDraft[] =>
  correct.map((isCorrect, index) => ({
    key: String.fromCharCode(65 + index),
    content: text(`option ${index}`),
    isCorrect,
    displayOrder: index,
  }));

const mapping = (role: MappingDraft["role"], skillId: string): MappingDraft => ({
  skillId,
  subskillId: null,
  role,
  attributionWeight: role === "PRIMARY" ? 1 : 0.35,
  rationale: null,
});

describe("answer key", () => {
  it("single choice needs exactly one correct option", () => {
    expect(answerKeyProblems("SINGLE_CHOICE", options(true, false, false))).toEqual([]);
    expect(answerKeyProblems("SINGLE_CHOICE", options(true, true, false))).not.toEqual([]);
    expect(answerKeyProblems("SINGLE_CHOICE", options(false, false))).not.toEqual([]);
  });

  it("multiple choice needs at least one correct option", () => {
    expect(answerKeyProblems("MULTIPLE_CHOICE", options(true, true, false))).toEqual([]);
    expect(answerKeyProblems("MULTIPLE_CHOICE", options(false, false))).not.toEqual([]);
  });

  it("true/false has exactly two options, one correct", () => {
    expect(answerKeyProblems("TRUE_FALSE", options(true, false))).toEqual([]);
    expect(answerKeyProblems("TRUE_FALSE", options(true, false, false))).not.toEqual([]);
  });

  it("rejects a single option: there is nothing to choose between", () => {
    expect(answerKeyProblems("SINGLE_CHOICE", options(true))).not.toEqual([]);
  });
});

describe("mappings", () => {
  it("requires exactly one PRIMARY mapping", () => {
    expect(mappingProblems([mapping("PRIMARY", "a"), mapping("SECONDARY", "b")])).toEqual([]);
    expect(mappingProblems([mapping("SECONDARY", "a")])).not.toEqual([]);
    expect(mappingProblems([mapping("PRIMARY", "a"), mapping("PRIMARY", "b")])).not.toEqual([]);
  });

  it("flags duplicate option keys and duplicate nodes even in a draft", () => {
    const draft = {
      options: [...options(true), ...options(false)],
      mappings: [mapping("PRIMARY", "a"), mapping("SECONDARY", "a")],
    } as DraftContent;
    expect(structuralProblems(draft)).toHaveLength(2);
  });
});

// SECURITY.md / AGENTS.md §3: the answer key never reaches a student before they answer.
describe("student view", () => {
  const version = {
    id: "version-1",
    questionType: "SINGLE_CHOICE" as const,
    stem: text("What is 2 + 2?"),
    explanation: text("Because arithmetic."),
    difficulty: 0.25,
    options: [
      { key: "B", content: text("4"), isCorrect: true, displayOrder: 1 },
      { key: "A", content: text("3"), isCorrect: false, displayOrder: 0 },
    ],
    mappings: [mapping("PRIMARY", "skill-1")],
  };

  it("contains no answer key, explanation, difficulty or mapping", () => {
    const serialized = JSON.stringify(toStudentQuestionView(version));

    for (const secret of ["isCorrect", "Because arithmetic", "difficulty", "skill-1", "mappings"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("keeps the authored option order", () => {
    expect(toStudentQuestionView(version).options.map((o) => o.key)).toEqual(["A", "B"]);
  });
});
