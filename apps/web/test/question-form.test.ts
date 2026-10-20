import { describe, expect, it } from "vitest";

import { ApiError } from "../src/lib/api";
import { errorMessage } from "../src/lib/messages";
import type { QuestionVersion } from "../src/lib/question-api";
import {
  contentProblemMessages,
  DIFFICULTY_PRESETS,
  emptyQuestionForm,
  formFromVersion,
  optionKey,
  questionFormSchema,
  toDraftContentInput,
} from "../src/lib/question-form";

const text = (value: string) => ({ blocks: [{ type: "text" as const, text: value }] });

const version: QuestionVersion = {
  id: "qv1",
  questionId: "q1",
  versionNumber: 1,
  status: "DRAFT",
  questionType: "SINGLE_CHOICE",
  stem: {
    blocks: [
      { type: "text", text: "إذا كان" },
      { type: "math", latex: "x^2=4" },
    ],
  },
  explanation: text("لأن الجذر موجب."),
  difficulty: 0.75,
  taxonomyVersionId: "tv1",
  sourceType: "BOOK",
  sourceReference: null,
  publishedAt: null,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
  options: [
    { key: "A", content: text("2"), isCorrect: true, displayOrder: 0 },
    { key: "B", content: text("-2"), isCorrect: false, displayOrder: 1 },
  ],
  mappings: [
    { skillId: "s1", subskillId: null, role: "PRIMARY", attributionWeight: 1, rationale: null },
    {
      skillId: null,
      subskillId: "ss1",
      role: "SECONDARY",
      attributionWeight: 0.35,
      rationale: "يقيس الجذور",
    },
  ],
  reviews: [],
};

describe("question form ↔ API body", () => {
  it("round-trips a saved version's content", () => {
    expect(toDraftContentInput(formFromVersion(version))).toEqual({
      questionType: "SINGLE_CHOICE",
      stem: version.stem,
      explanation: version.explanation,
      difficulty: 0.75,
      taxonomyVersionId: "tv1",
      sourceType: "BOOK",
      options: [
        { key: "A", content: text("2"), isCorrect: true, displayOrder: 0 },
        { key: "B", content: text("-2"), isCorrect: false, displayOrder: 1 },
      ],
      mappings: [
        { skillId: "s1", role: "PRIMARY", attributionWeight: 1 },
        { subskillId: "ss1", role: "SECONDARY", attributionWeight: 0.35, rationale: "يقيس الجذور" },
      ],
    });
  });

  it("drops empty blocks and omits an empty explanation", () => {
    const form = {
      ...formFromVersion(version),
      stem: [
        { type: "text" as const, value: "سؤال" },
        { type: "text" as const, value: "   " },
      ],
      explanation: [{ type: "text" as const, value: "" }],
    };
    const body = toDraftContentInput(form);
    expect(body.stem).toEqual(text("سؤال"));
    expect(body).not.toHaveProperty("explanation");
  });

  it("starts a new question with four lettered options and a middle difficulty", () => {
    const form = emptyQuestionForm();
    expect(form.options.map((option) => option.key)).toEqual(["A", "B", "C", "D"]);
    expect(Number(form.difficulty)).toBe(0.5);
    expect(DIFFICULTY_PRESETS.map((preset) => preset.value)).toEqual([0.25, 0.5, 0.75, 0.9]);
  });

  it("letters options in order", () => {
    expect(optionKey(0)).toBe("A");
    expect(optionKey(5)).toBe("F");
  });
});

describe("question form schema", () => {
  const valid = () => formFromVersion(version);

  it("accepts a saved version", () => {
    expect(questionFormSchema.safeParse(valid()).success).toBe(true);
  });

  it("rejects a lower-case option key and a seventh option", () => {
    const lower = { ...valid(), options: [{ ...valid().options[0], key: "a" }] };
    expect(questionFormSchema.safeParse(lower).success).toBe(false);
    const many = {
      ...valid(),
      options: Array.from({ length: 7 }, (_, index) => ({
        key: optionKey(index),
        content: [{ type: "text" as const, value: "خيار" }],
        isCorrect: index === 0,
      })),
    };
    expect(questionFormSchema.safeParse(many).success).toBe(false);
  });

  it("requires a stem and a taxonomy version", () => {
    const empty = {
      ...valid(),
      stem: [{ type: "text" as const, value: " " }],
      taxonomyVersionId: "",
    };
    const issues = questionFormSchema.safeParse(empty).error?.issues.map((i) => i.path[0]);
    expect(issues).toEqual(expect.arrayContaining(["stem", "taxonomyVersionId"]));
  });
});

describe("content problems in Arabic", () => {
  const invalid = (rules: (string | undefined)[]) =>
    new ApiError(
      422,
      "QUESTION_CONTENT_INVALID",
      "x",
      rules.map((rule) => ({ path: "", message: "english text", rule })),
    );

  it("explains each broken rule, never the server's text", () => {
    const lines = contentProblemMessages(
      invalid(["CORRECT_ANSWER_COUNT", "PRIMARY_MAPPING_COUNT"]),
    );
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/[؀-ۿ]/);
      expect(line).not.toContain("english text");
    }
  });

  it("falls back to one general line for an unknown rule", () => {
    expect(contentProblemMessages(invalid(["SOMETHING_NEW", undefined]))).toHaveLength(1);
  });

  it("has nothing to list for other errors", () => {
    expect(contentProblemMessages(new ApiError(409, "QUESTION_CODE_TAKEN", "x", null))).toEqual([]);
  });
});

describe("question error messages", () => {
  it.each([
    "QUESTION_VERSION_CHANGED",
    "QUESTION_VERSION_IN_PROGRESS",
    "INVALID_QUESTION_TRANSITION",
    "TAXONOMY_NOT_PUBLISHED",
    "QUESTION_CONTENT_INVALID",
  ])("shows %s in Arabic", (code) => {
    const message = errorMessage(new ApiError(409, code, "server text", null));
    expect(message).toMatch(/[\u0600-\u06FF]/);
    expect(message).not.toBe(errorMessage(new ApiError(500, "UNKNOWN", "x", null)));
  });
});
