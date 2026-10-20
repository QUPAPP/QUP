import { normaliseText } from "./text-normalisation.js";

/**
 * One spreadsheet row → the canonical question shape of
 * QUESTION_BANK_IMPORT.md ("Canonical Normalized Shape"), or the reasons it
 * cannot be one. Pure. The question bank's own content rules (option and
 * answer counts per type, mappings) are checked afterwards by the questions
 * module, so they are not repeated here.
 */

/** Columns of the file, chosen per field by the person importing. */
export interface ImportMapping {
  stem: string;
  /** 2–6 columns, in option order (A, B, …). */
  options: string[];
  correctAnswer: string;
  skill: string;
  subskill?: string;
  questionType?: string;
  explanation?: string;
  difficulty?: string;
  source?: string;
}

export type RowErrorCode =
  | "STEM_MISSING"
  | "OPTIONS_TOO_FEW"
  | "CORRECT_ANSWER_MISSING"
  | "CORRECT_ANSWER_UNKNOWN"
  | "QUESTION_TYPE_UNKNOWN"
  | "SKILL_UNKNOWN"
  | "SUBSKILL_UNKNOWN"
  | "DIFFICULTY_INVALID";

export type ImportQuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";

export interface NormalisedRow {
  questionType: ImportQuestionType;
  stem: string;
  options: { key: string; text: string; isCorrect: boolean }[];
  explanation: string | null;
  difficulty: number;
  /** Exactly one is set: the subskill when the row names one, else the skill. */
  skillId: string | null;
  subskillId: string | null;
  source: string | null;
}

/** The active skills of the chosen taxonomy version. */
export interface ImportOutline {
  skills: {
    id: string;
    code: string;
    name: string;
    subskills: { id: string; code: string; name: string }[];
  }[];
}

const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];
const ARABIC_LETTERS = ["ا", "ب", "ج", "د", "ه", "و"];
const MIN_OPTIONS = 2;
const PERCENT = 100;
const DIFFICULTY_SCALE = 1000;

/** ADAPTIVE_ENGINE.md §4 authoring defaults, as A2 offers them (OPEN_QUESTIONS.md). */
const DIFFICULTY_WORDS: Record<string, number> = {
  سهل: 0.25,
  easy: 0.25,
  متوسط: 0.5,
  medium: 0.5,
  صعب: 0.75,
  hard: 0.75,
};
const DEFAULT_DIFFICULTY = 0.5;

const TYPE_WORDS: Record<string, ImportQuestionType> = {
  single: "SINGLE_CHOICE",
  single_choice: "SINGLE_CHOICE",
  "اختيار من متعدد": "SINGLE_CHOICE",
  "اجابه واحده": "SINGLE_CHOICE",
  multiple: "MULTIPLE_CHOICE",
  multiple_choice: "MULTIPLE_CHOICE",
  "متعدد الاجابات": "MULTIPLE_CHOICE",
  "اكثر من اجابه": "MULTIPLE_CHOICE",
  true_false: "TRUE_FALSE",
  "صح وخطا": "TRUE_FALSE",
  "صح او خطا": "TRUE_FALSE",
};

export function normaliseRow(
  raw: Readonly<Record<string, string>>,
  mapping: ImportMapping,
  outline: ImportOutline,
): { ok: true; row: NormalisedRow } | { ok: false; errors: RowErrorCode[] } {
  const cell = (column: string | undefined) => (column ? (raw[column] ?? "").trim() : "");
  const errors: RowErrorCode[] = [];

  const stem = cell(mapping.stem);
  if (!stem) errors.push("STEM_MISSING");

  const texts = mapping.options.map(cell).filter((text) => text !== "");
  if (texts.length < MIN_OPTIONS) errors.push("OPTIONS_TOO_FEW");

  const answer = cell(mapping.correctAnswer);
  let correct: Set<number> | null = null;
  if (!answer) errors.push("CORRECT_ANSWER_MISSING");
  else {
    correct = correctPositions(answer, texts);
    if (!correct) errors.push("CORRECT_ANSWER_UNKNOWN");
  }

  const typeCell = normaliseText(cell(mapping.questionType));
  let questionType: ImportQuestionType | undefined;
  if (typeCell) {
    questionType = TYPE_WORDS[typeCell];
    if (!questionType) errors.push("QUESTION_TYPE_UNKNOWN");
  }

  const node = resolveNode(cell(mapping.skill), cell(mapping.subskill), outline);
  if (node.error) errors.push(node.error);

  const difficulty = readDifficulty(cell(mapping.difficulty));
  if (difficulty === null) errors.push("DIFFICULTY_INVALID");

  if (errors.length > 0 || !correct || difficulty === null) return { ok: false, errors };
  return {
    ok: true,
    row: {
      questionType: questionType ?? (correct.size > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE"),
      stem,
      options: texts.map((text, index) => ({
        key: OPTION_KEYS[index] ?? String(index + 1),
        text,
        isCorrect: correct.has(index),
      })),
      explanation: cell(mapping.explanation) || null,
      difficulty,
      skillId: node.subskillId ? null : node.skillId,
      subskillId: node.subskillId,
      source: cell(mapping.source) || null,
    },
  };
}

/**
 * "ب", "B", "2", or an option's own text; several joined by "," or "،".
 * An exact option text wins, then a letter, then a position. Null when any
 * part names no option.
 */
function correctPositions(answer: string, options: readonly string[]): Set<number> | null {
  const normalisedOptions = options.map(normaliseText);
  const positions = new Set<number>();
  for (const part of answer.split(/[,،;]/)) {
    const token = normaliseText(part);
    if (!token) continue;
    let position = normalisedOptions.indexOf(token);
    if (position < 0) position = OPTION_KEYS.indexOf(token.toUpperCase());
    if (position < 0) position = ARABIC_LETTERS.indexOf(token);
    if (position < 0 && /^[1-6]$/.test(token)) position = Number(token) - 1;
    if (position < 0 || position >= options.length) return null;
    positions.add(position);
  }
  return positions.size > 0 ? positions : null;
}

function resolveNode(
  skillCell: string,
  subskillCell: string,
  outline: ImportOutline,
): { skillId: string | null; subskillId: string | null; error?: RowErrorCode } {
  const matches = (node: { code: string; name: string }, value: string) =>
    node.code.toUpperCase() === value.trim().toUpperCase() ||
    normaliseText(node.name) === normaliseText(value);
  const skill = skillCell ? outline.skills.find((s) => matches(s, skillCell)) : undefined;
  if (!skill) return { skillId: null, subskillId: null, error: "SKILL_UNKNOWN" };
  if (!subskillCell) return { skillId: skill.id, subskillId: null };
  const subskill = skill.subskills.find((s) => matches(s, subskillCell));
  return subskill
    ? { skillId: skill.id, subskillId: subskill.id }
    : { skillId: skill.id, subskillId: null, error: "SUBSKILL_UNKNOWN" };
}

/** 0–1 as is, 1–100 as a percentage, or a word; blank → the default. Null when unreadable. */
function readDifficulty(value: string): number | null {
  if (!value) return DEFAULT_DIFFICULTY;
  const normalised = normaliseText(value);
  const word = DIFFICULTY_WORDS[normalised];
  if (word !== undefined) return word;
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  const number = Number(normalised);
  const share = number <= 1 ? number : number <= PERCENT ? number / PERCENT : null;
  return share === null ? null : Math.round(share * DIFFICULTY_SCALE) / DIFFICULTY_SCALE;
}
