import { ApiError } from "./api";

/**
 * Arabic wording for the API's stable error codes. The API's own messages are
 * written in English for developers; students read these instead. An unknown
 * code falls back to a general message — never to raw server text.
 */
const BY_CODE: Record<string, string> = {
  INVALID_CREDENTIALS: "بيانات الدخول غير صحيحة.",
  IDENTIFIER_TAKEN: "هذا البريد أو رقم الجوال مسجّل من قبل. جرّب تسجيل الدخول.",
  ACCOUNT_DISABLED: "هذا الحساب موقوف. تواصل مع الدعم.",
  VALIDATION_FAILED: "تحقق من البيانات المدخلة ثم حاول مرة أخرى.",
  RATE_LIMITED: "محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
  EXAM_NOT_AVAILABLE: "هذا الاختبار غير متاح حاليًا.",
  NO_QUESTIONS_AVAILABLE: "لا توجد أسئلة متاحة لهذا الاختبار بعد.",
  ASSESSMENT_NOT_FOUND: "لم نجد هذا التشخيص.",
  ASSESSMENT_NOT_COMPLETED: "النتيجة تظهر بعد إكمال التشخيص.",
  ASSESSMENT_ITEM_ALREADY_ANSWERED: "تمت الإجابة عن هذا السؤال من قبل.",
  PLAN_NOT_AVAILABLE: "هذه الباقة غير متاحة حاليًا.",
  ALREADY_ENTITLED: "أنت مشترك في هذا الاختبار بالفعل.",
  PAYMENTS_NOT_CONFIGURED: "الدفع الإلكتروني غير متاح حاليًا. حاول لاحقًا.",
  PAYMENT_PROVIDER_UNAVAILABLE: "تعذّر الاتصال بخدمة الدفع. لم يُخصم منك شيء؛ حاول مرة أخرى.",
  SERVICE_UNAVAILABLE: "الخدمة غير متاحة مؤقتًا. حاول بعد قليل.",
};

const FALLBACK = "حدث خطأ غير متوقع. حاول مرة أخرى.";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return BY_CODE[error.code] ?? FALLBACK;
  return FALLBACK;
}

const MINOR_UNITS_PER_RIYAL = 100;

/** Display only: 19900 → "199 ر.س". The amount charged is the server's. */
export function formatPrice(amountMinor: number, currency: string): string {
  const amount = amountMinor / MINOR_UNITS_PER_RIYAL;
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    maximumFractionDigits: amountMinor % MINOR_UNITS_PER_RIYAL === 0 ? 0 : 2,
  }).format(amount);
}
