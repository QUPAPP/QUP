/**
 * The weighted admission percentage (النسبة الموزونة) Saudi universities
 * compute from the high-school average and the Qiyas tests. Each university
 * and college publishes its own weights; the presets are common examples,
 * not a promise about any university.
 */

export interface WeightedInputs {
  highSchool: number | null;
  aptitude: number | null;
  achievement: number | null;
}

export interface Weights {
  highSchool: number;
  aptitude: number;
  achievement: number;
}

export interface WeightPreset {
  id: string;
  label: string;
  weights: Weights;
}

export const WEIGHT_PRESETS: readonly WeightPreset[] = [
  {
    id: "30-30-40",
    label: "ثانوية 30٪ · قدرات 30٪ · تحصيلي 40٪",
    weights: { highSchool: 30, aptitude: 30, achievement: 40 },
  },
  {
    id: "40-30-30",
    label: "ثانوية 40٪ · قدرات 30٪ · تحصيلي 30٪",
    weights: { highSchool: 40, aptitude: 30, achievement: 30 },
  },
  {
    id: "50-50-0",
    label: "ثانوية 50٪ · قدرات 50٪ (بدون تحصيلي)",
    weights: { highSchool: 50, aptitude: 50, achievement: 0 },
  },
];

const FULL = 100;
const DECIMALS = 2;

export type WeightedResult =
  | { ok: true; score: number; parts: Weights }
  | { ok: false; problem: "WEIGHTS_NOT_100" | "MISSING_SCORE" | "OUT_OF_RANGE" };

const inRange = (value: number) => Number.isFinite(value) && value >= 0 && value <= FULL;
const round = (value: number) => Math.round(value * 10 ** DECIMALS) / 10 ** DECIMALS;

/** Each score times its weight; a part with weight 0 needs no score. */
export function weightedScore(inputs: WeightedInputs, weights: Weights): WeightedResult {
  const weightValues = [weights.highSchool, weights.aptitude, weights.achievement];
  if (!weightValues.every(inRange)) return { ok: false, problem: "OUT_OF_RANGE" };
  if (round(weightValues.reduce((sum, value) => sum + value, 0)) !== FULL) {
    return { ok: false, problem: "WEIGHTS_NOT_100" };
  }
  const keys = ["highSchool", "aptitude", "achievement"] as const;
  const parts = { highSchool: 0, aptitude: 0, achievement: 0 };
  for (const key of keys) {
    if (weights[key] === 0) continue;
    const value = inputs[key];
    if (value === null) return { ok: false, problem: "MISSING_SCORE" };
    if (!inRange(value)) return { ok: false, problem: "OUT_OF_RANGE" };
    parts[key] = round((value * weights[key]) / FULL);
  }
  return { ok: true, score: round(parts.highSchool + parts.aptitude + parts.achievement), parts };
}

/** A typed field as a number, or null while it is empty or not a number. */
export function parseScore(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace("٫", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
