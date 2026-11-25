import { LEGAL_CONTACT, REFUND_WINDOW_HOURS } from "./legal";

/**
 * Why people write to QUP, each with a ready email: the subject tells support
 * what it is, and the body lists what they need to act on it the first time.
 */
export interface ContactReason {
  id: string;
  title: string;
  description: string;
  subject: string;
  body: string;
}

export const CONTACT_REASONS: readonly ContactReason[] = [
  {
    id: "refund",
    title: "طلب استرجاع مبلغ",
    description: `استرجاع كامل المبلغ خلال ${REFUND_WINDOW_HOURS} ساعة من تفعيل الاشتراك، ويُعاد إلى وسيلة الدفع نفسها.`,
    subject: "طلب استرجاع مبلغ اشتراك",
    body: [
      "البريد أو الجوال المسجّل في الحساب:",
      "اسم الباقة:",
      "تاريخ الدفع:",
      "سبب الاسترجاع (اختياري):",
    ].join("\n"),
  },
  {
    id: "account",
    title: "مشكلة في الحساب أو الدخول",
    description: "نسيت كلمة المرور وحسابك بالجوال فقط، أو تريد تغيير بريدك أو رقمك المسجّل.",
    subject: "مساعدة في الحساب",
    body: ["البريد أو الجوال المسجّل في الحساب:", "وصف المشكلة:"].join("\n"),
  },
  {
    id: "payment",
    title: "دفعت ولم يُفعَّل اشتراكي",
    description: "نراجع الدفعة مع مزوّد الدفع ونفعّل اشتراكك، أو نعيد المبلغ.",
    subject: "دفعة لم يُفعَّل اشتراكها",
    body: [
      "البريد أو الجوال المسجّل في الحساب:",
      "اسم الباقة:",
      "تاريخ ووقت الدفع:",
      "آخر أربعة أرقام من البطاقة (لا ترسل الرقم كاملًا):",
    ].join("\n"),
  },
  {
    id: "privacy",
    title: "بياناتك الشخصية",
    description: "طلب نسخة من بياناتك أو تصحيحها. ولحذف حسابك نهائيًا افتح «حسابي» ← «حذف الحساب».",
    subject: "طلب يخص بياناتي الشخصية",
    body: ["البريد أو الجوال المسجّل في الحساب:", "نوع الطلب (نسخة / تصحيح / غير ذلك):"].join("\n"),
  },
];

export function mailtoFor(reason: Pick<ContactReason, "subject" | "body">): string {
  const query = new URLSearchParams({ subject: reason.subject, body: reason.body });
  // mailto bodies are read by mail apps that expect %20, not "+", for spaces.
  return `mailto:${LEGAL_CONTACT.email}?${query.toString().replace(/\+/g, "%20")}`;
}
