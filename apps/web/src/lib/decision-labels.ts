import type { AnalyticsWindow } from "./admin-insights-api";

/** Why the engine chose a question (ADAPTIVE_ENGINE.md §15–§20), in words. */
const REASONS = {
  TOP_GAP: "أكبر فجوة أولوية",
  CONTINUE_TARGET: "استمرار على مهارة الجلسة",
  NEEDS_MEASUREMENT: "مهارة تحتاج قياسًا أكثر",
  PREREQUISITE_CHECK: "فحص متطلب سابق بعد أخطاء متتالية",
  RECENT_CORRECT_UP: "صعوبة أعلى بعد إجابتين صحيحتين",
  RECENT_WRONG_DOWN: "صعوبة أقل بعد إجابتين خاطئتين",
  DIFFICULTY_BAND_WIDENED: "وُسِّع نطاق الصعوبة لعدم وجود سؤال قريب",
} as const;

export const REASON_CODES = Object.keys(REASONS) as (keyof typeof REASONS)[];

export function reasonLabel(code: string): string {
  return (REASONS as Record<string, string>)[code] ?? code;
}

export const ANALYTICS_WINDOWS: readonly AnalyticsWindow[] = [7, 30];

/** Arabic counts the noun by number: "آخر 7 أيام", "آخر 30 يومًا". */
export const WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  7: "آخر 7 أيام",
  30: "آخر 30 يومًا",
};
const DEFAULT_WINDOW: AnalyticsWindow = 7;

/** The window a URL asks for, when the API accepts it; otherwise the default. */
export function windowFromQuery(value: string | null): AnalyticsWindow {
  const days = Number(value);
  return ANALYTICS_WINDOWS.find((window) => window === days) ?? DEFAULT_WINDOW;
}
