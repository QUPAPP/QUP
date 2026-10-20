import { normaliseText } from "./text-normalisation.js";

/**
 * QUESTION_BANK_IMPORT.md "auto-suggest mapping": common Arabic and English
 * headers. A suggestion only pre-fills the form; the person confirms it.
 */

export interface SuggestedMapping {
  stem?: string;
  options: string[];
  correctAnswer?: string;
  skill?: string;
  subskill?: string;
  questionType?: string;
  explanation?: string;
  difficulty?: string;
  source?: string;
}

type SingleField = Exclude<keyof SuggestedMapping, "options">;

const SYNONYMS: Record<SingleField, readonly string[]> = {
  stem: ["السؤال", "نص السؤال", "question", "stem", "question text"],
  correctAnswer: [
    "الاجابه الصحيحه",
    "الصحيحه",
    "الاجابه",
    "الحل",
    "correct",
    "correct answer",
    "answer",
    "answer key",
    "key",
  ],
  skill: ["المهاره", "رمز المهاره", "skill", "skill code"],
  subskill: ["المهاره الفرعيه", "subskill", "sub skill", "sub-skill"],
  questionType: ["نوع السؤال", "النوع", "type", "question type"],
  explanation: ["الشرح", "التفسير", "explanation", "rationale"],
  difficulty: ["الصعوبه", "مستوي الصعوبه", "difficulty", "level"],
  source: ["المصدر", "source", "reference"],
};

/** "الخيار أ", "option 2", "ب", "choice c" → the option's position (0-based). */
const OPTION_HEADER =
  /^(?:option|choice|answer|الخيار|الاختيار|الاجابه|البديل)?\s*[-_.]?\s*([a-f]|[ابجدهو]|[1-6])$/;
const ARABIC_OPTION_LETTERS = "ابجدهو";
const LATIN_OPTION_LETTERS = "abcdef";

export function optionPosition(header: string): number | null {
  const match = OPTION_HEADER.exec(normaliseText(header));
  const mark = match?.[1];
  if (!mark) return null;
  if (/[1-6]/.test(mark)) return Number(mark) - 1;
  const latin = LATIN_OPTION_LETTERS.indexOf(mark);
  return latin >= 0 ? latin : ARABIC_OPTION_LETTERS.indexOf(mark);
}

export function suggestMapping(headers: readonly string[]): SuggestedMapping {
  const suggestion: SuggestedMapping = { options: [] };
  const options: { header: string; position: number }[] = [];
  for (const header of headers) {
    const normalised = normaliseText(header);
    const field = (Object.keys(SYNONYMS) as SingleField[]).find(
      (key) => suggestion[key] === undefined && SYNONYMS[key].includes(normalised),
    );
    if (field) {
      suggestion[field] = header;
      continue;
    }
    const position = optionPosition(header);
    if (position !== null) options.push({ header, position });
  }
  suggestion.options = options.sort((a, b) => a.position - b.position).map((o) => o.header);
  return Object.fromEntries(
    Object.entries(suggestion).filter(([key, value]) => key === "options" || value !== undefined),
  ) as SuggestedMapping;
}
