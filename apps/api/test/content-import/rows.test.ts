import { describe, expect, it } from "vitest";

import { suggestMapping } from "../../src/modules/content-import/domain/column-suggestions.js";
import { stemFingerprint } from "../../src/modules/content-import/domain/fingerprint.js";
import {
  type ImportMapping,
  normaliseRow,
} from "../../src/modules/content-import/domain/row-normaliser.js";

const outline = {
  skills: [
    {
      id: "s-analogy",
      code: "V-ANALOGY",
      name: "التناظر اللفظي",
      subskills: [{ id: "ss-syn", code: "SYN", name: "المترادفات" }],
    },
    { id: "s-algebra", code: "Q-ALG", name: "الجبر", subskills: [] },
  ],
};

const mapping: ImportMapping = {
  stem: "السؤال",
  options: ["أ", "ب", "ج", "د"],
  correctAnswer: "الإجابة الصحيحة",
  skill: "المهارة",
  subskill: "المهارة الفرعية",
  questionType: "النوع",
  explanation: "الشرح",
  difficulty: "الصعوبة",
  source: "المصدر",
};

const row = (overrides: Record<string, string> = {}) => ({
  السؤال: "كم يساوي ٢ + ٢؟",
  أ: "ثلاثة",
  ب: "أربعة",
  ج: "خمسة",
  د: "",
  "الإجابة الصحيحة": "ب",
  المهارة: "q-alg",
  "المهارة الفرعية": "",
  النوع: "",
  الشرح: "جمع بسيط",
  الصعوبة: "",
  المصدر: "",
  ...overrides,
});

describe("row normaliser", () => {
  it("builds a single-choice draft from a typical Arabic row", () => {
    expect(normaliseRow(row(), mapping, outline)).toEqual({
      ok: true,
      row: {
        questionType: "SINGLE_CHOICE",
        stem: "كم يساوي ٢ + ٢؟",
        options: [
          { key: "A", text: "ثلاثة", isCorrect: false },
          { key: "B", text: "أربعة", isCorrect: true },
          { key: "C", text: "خمسة", isCorrect: false },
        ],
        explanation: "جمع بسيط",
        difficulty: 0.5,
        skillId: "s-algebra",
        subskillId: null,
        source: null,
      },
    });
  });

  it.each([
    ["Latin letter", "b", [false, true, false]],
    ["number", "٣", [false, false, true]],
    ["option text", "خمسة", [false, false, true]],
    ["several, Arabic comma", "أ، ج", [true, false, true]],
  ])("reads the correct answer as a %s", (_name, answer, expected) => {
    const result = normaliseRow(row({ "الإجابة الصحيحة": answer }), mapping, outline);
    expect(result.ok && result.row.options.map((o) => o.isCorrect)).toEqual(expected);
  });

  it("infers multiple choice from several correct answers, and reads explicit types", () => {
    const multi = normaliseRow(row({ "الإجابة الصحيحة": "A,B" }), mapping, outline);
    expect(multi.ok && multi.row.questionType).toBe("MULTIPLE_CHOICE");
    const tf = normaliseRow(
      row({ النوع: "صح وخطأ", أ: "صح", ب: "خطأ", ج: "", "الإجابة الصحيحة": "أ" }),
      mapping,
      outline,
    );
    expect(tf.ok && tf.row.questionType).toBe("TRUE_FALSE");
  });

  it.each([
    ["سهل", 0.25],
    ["صعب", 0.75],
    ["0.6", 0.6],
    ["٨٠", 0.8],
  ])("reads difficulty %s", (value, expected) => {
    const result = normaliseRow(row({ الصعوبة: value }), mapping, outline);
    expect(result.ok && result.row.difficulty).toBeCloseTo(expected, 5);
  });

  it("maps to the named subskill alone, finding its skill by name with diacritics ignored", () => {
    const result = normaliseRow(
      row({ المهارة: "التَّناظُر اللفظي", "المهارة الفرعية": "المترادفات" }),
      mapping,
      outline,
    );
    expect(result.ok && [result.row.skillId, result.row.subskillId]).toEqual([null, "ss-syn"]);
  });

  it("collects every problem of a broken row", () => {
    const result = normaliseRow(
      row({
        السؤال: " ",
        أ: "",
        ب: "",
        ج: "وحيد",
        "الإجابة الصحيحة": "",
        المهارة: "غير موجودة",
        النوع: "مقالي",
        الصعوبة: "جدًا",
      }),
      mapping,
      outline,
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        "STEM_MISSING",
        "OPTIONS_TOO_FEW",
        "CORRECT_ANSWER_MISSING",
        "QUESTION_TYPE_UNKNOWN",
        "SKILL_UNKNOWN",
        "DIFFICULTY_INVALID",
      ],
    });
  });

  it("flags an answer that names no option, and an unknown subskill", () => {
    expect(normaliseRow(row({ "الإجابة الصحيحة": "هـ" }), mapping, outline)).toEqual({
      ok: false,
      errors: ["CORRECT_ANSWER_UNKNOWN"],
    });
    expect(
      normaliseRow(row({ المهارة: "V-ANALOGY", "المهارة الفرعية": "الأضداد" }), mapping, outline),
    ).toEqual({ ok: false, errors: ["SUBSKILL_UNKNOWN"] });
  });
});

describe("fingerprint", () => {
  it("ignores diacritics, tatweel, alef and ya forms, punctuation, spacing and case", () => {
    expect(stemFingerprint("إِذا كانَ  الـعدد  كبيرًا؟")).toBe(stemFingerprint("اذا كان العدد كبيرا"));
    expect(stemFingerprint("Which IS bigger?")).toBe(stemFingerprint("which is bigger"));
    expect(stemFingerprint("مستشفى")).toBe(stemFingerprint("مستشفي"));
    expect(stemFingerprint("كم يساوي ٢")).not.toBe(stemFingerprint("كم يساوي ٣"));
  });
});

describe("column suggestions", () => {
  it("recognises common Arabic and English headers", () => {
    expect(
      suggestMapping([
        "رقم",
        "نص السؤال",
        "الخيار أ",
        "الخيار ب",
        "الخيار ج",
        "الإجابة الصحيحة",
        "المهارة",
        "Difficulty",
        "الشرح",
      ]),
    ).toEqual({
      stem: "نص السؤال",
      options: ["الخيار أ", "الخيار ب", "الخيار ج"],
      correctAnswer: "الإجابة الصحيحة",
      skill: "المهارة",
      difficulty: "Difficulty",
      explanation: "الشرح",
    });
    expect(suggestMapping(["question", "option 2", "option 1", "answer"])).toEqual({
      stem: "question",
      options: ["option 1", "option 2"],
      correctAnswer: "answer",
    });
  });
});
