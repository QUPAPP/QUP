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
  FORBIDDEN: "ليس لديك صلاحية لهذا الإجراء.",
  // Admin: exams and taxonomy.
  EXAM_NOT_FOUND: "لم نجد هذا الاختبار.",
  EXAM_IDENTIFIER_TAKEN: "رمز الاختبار أو رابطه مستخدم من قبل. اختر غيره.",
  INVALID_EXAM_TRANSITION: "لا يمكن نقل الاختبار إلى هذه الحالة من حالته الحالية.",
  EXAM_HAS_NO_PUBLISHED_TAXONOMY: "لا يمكن تفعيل الاختبار قبل نشر نسخة من تصنيفه.",
  TAXONOMY_VERSION_NOT_FOUND: "لم نجد نسخة التصنيف هذه.",
  TAXONOMY_VERSION_CODE_TAKEN: "رمز النسخة مستخدم من قبل لهذا الاختبار.",
  TAXONOMY_VERSION_NOT_DRAFT:
    "هذه النسخة لم تعد مسودة، فلا يمكن تعديلها. أي تغيير يكون في نسخة جديدة.",
  TAXONOMY_NODE_NOT_FOUND: "لم نجد هذا العنصر في التصنيف. ربما حُذف أو تغيّر.",
  TAXONOMY_CODE_TAKEN: "هذا الرمز مستخدم من قبل تحت نفس العنصر. اختر رمزًا آخر.",
  PREREQUISITE_CYCLE: "لا يمكن إضافة هذا المتطلب: سيجعل المهارات تعتمد على بعضها في حلقة.",
  PREREQUISITE_OUTSIDE_VERSION: "المتطلب يجب أن يكون مهارة من نفس نسخة التصنيف.",
  TAXONOMY_INCOMPLETE: "لا يمكن النشر: يلزم مجال نشط واحد على الأقل، وفي كل مجال مهارة نشطة.",
  TAXONOMY_PUBLISH_CONFLICT: "نُشرت نسخة أخرى في نفس الوقت. حدّث الصفحة وحاول مرة أخرى.",
  // Admin: question bank.
  QUESTION_NOT_FOUND: "لم نجد هذا السؤال.",
  QUESTION_VERSION_NOT_FOUND: "لم نجد هذه النسخة من السؤال.",
  QUESTION_CODE_TAKEN: "رمز السؤال مستخدم من قبل. اختر رمزًا آخر.",
  INVALID_QUESTION_TRANSITION:
    "لا يمكن تنفيذ هذا الإجراء على النسخة في حالتها الحالية. حدّثنا الصفحة لتعرض حالتها.",
  QUESTION_VERSION_CHANGED:
    "غيّر شخص آخر هذه النسخة قبل لحظات. حدّثنا الصفحة؛ راجعها ثم أعد المحاولة.",
  QUESTION_VERSION_IN_PROGRESS:
    "لهذا السؤال نسخة قيد العمل بالفعل. أكملها أو انتظر نشرها قبل بدء نسخة جديدة.",
  QUESTION_ARCHIVED: "هذا السؤال مؤرشف، فلا يمكن تعديله أو نشره.",
  QUESTION_CONTENT_INVALID: "السؤال لا يستوفي شروط هذا الإجراء بعد:",
  TAXONOMY_NOT_PUBLISHED: "لا يُنشر السؤال قبل نشر نسخة التصنيف المرتبط بها.",
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
