import type { EmailMessage } from "./ports.js";

/**
 * The platform's emails, as pure functions of their data (no I/O), so every
 * wording and every escape is testable. Arabic, right-to-left, one visual
 * identity (UI_BRAND.md: navy; gold is reserved for earned mastery, so it is
 * not used here). Inline styles and tables only: mail clients ignore the rest.
 *
 * Every variable is HTML-escaped, including plan names, which an admin types.
 * A code never appears in a subject: subjects show in notification previews.
 */

export type OtpPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export type EmailTemplate =
  | { kind: "OTP"; purpose: OtpPurpose; code: string; validForMinutes: number }
  | {
      kind: "PAYMENT_RECEIPT";
      planName: string;
      amountMinor: number;
      currency: string;
      paidAt: Date;
      refundableUntil: Date;
      appUrl: string | null;
    }
  | { kind: "PAYMENT_REFUNDED"; planName: string; amountMinor: number; currency: string }
  | { kind: "PASSWORD_CHANGED"; changedAt: Date; appUrl: string | null }
  | { kind: "SUBSCRIPTION_ENDING"; examName: string; endsAt: Date; appUrl: string | null };

/** The notification kinds stored on `email_deliveries.kind`. */
export function deliveryKind(template: EmailTemplate): string {
  return template.kind === "OTP" ? `OTP_${template.purpose}` : template.kind;
}

const NAVY = "#081f3d";
const TEXT = "#13283f";
const MUTED = "#5b6b7d";
const BORDER = "#e1e8f0";
const SURFACE = "#f3f6fa";
const LOCALE = "ar-SA-u-nu-latn";
const TIME_ZONE = "Asia/Riyadh";
const MINOR_UNITS_PER_MAJOR = 100;
const MONO_FONTS = "SFMono-Regular,Consolas,Liberation Mono,monospace";
const BODY_FONTS = "Tahoma,Segoe UI,Arial,sans-serif";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: amountMinor % MINOR_UNITS_PER_MAJOR === 0 ? 0 : 2,
  }).format(amountMinor / MINOR_UNITS_PER_MAJOR);
}

export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    calendar: "gregory",
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(value);
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.9;color:${TEXT}">${escapeHtml(text)}</p>`;
}

function codeBox(code: string): string {
  return `<div dir="ltr" style="margin:8px 0 24px;padding:18px 12px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;text-align:center;font-family:${MONO_FONTS};font-size:34px;font-weight:700;letter-spacing:10px;color:${NAVY}">${escapeHtml(code)}</div>`;
}

function details(rows: readonly (readonly [string, string])[]): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${MUTED};font-size:14px">${escapeHtml(label)}</td><td dir="auto" style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${TEXT};font-size:15px;font-weight:600;text-align:left">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">${cells}</table>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:8px 0 24px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 26px;background:${NAVY};color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">${escapeHtml(label)}</a></p>`;
}

function layout(input: {
  preheader: string;
  heading: string;
  body: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.heading)}</title></head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:${BODY_FONTS}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden">
<tr><td dir="ltr" align="right" style="background:${NAVY};padding:22px 28px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px">QUP</td></tr>
<tr><td style="padding:30px 28px 8px">
<h1 style="margin:0 0 18px;font-size:21px;line-height:1.6;color:${NAVY}">${escapeHtml(input.heading)}</h1>
${input.body}
</td></tr>
<tr><td style="padding:0 28px 26px;border-top:1px solid ${BORDER}"><p style="margin:18px 0 0;font-size:13px;line-height:1.8;color:${MUTED}">${escapeHtml(input.footer)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

const AUTOMATED_FOOTER = "هذه رسالة آلية من منصة QUP، ولا يمكن الرد عليها. إذا لم تطلبها فتجاهلها.";

function renderOtp(t: Extract<EmailTemplate, { kind: "OTP" }>): EmailMessage {
  const verifying = t.purpose === "EMAIL_VERIFICATION";
  const heading = verifying ? "رمز توثيق بريدك الإلكتروني" : "رمز استعادة كلمة المرور";
  const lead = verifying
    ? "استخدم الرمز التالي لتوثيق بريدك الإلكتروني في QUP:"
    : "استخدم الرمز التالي لتعيين كلمة مرور جديدة لحسابك في QUP:";
  const valid = `ينتهي الرمز بعد ${t.validForMinutes} دقائق، ويُستخدم مرة واحدة فقط.`;
  const warning = verifying
    ? "لا تشارك هذا الرمز مع أحد. فريق QUP لن يطلبه منك أبدًا."
    : "لا تشارك هذا الرمز مع أحد. فريق QUP لن يطلبه منك أبدًا. إذا لم تطلب استعادة كلمة المرور فتجاهل هذه الرسالة؛ حسابك آمن ولن يتغير شيء.";
  return {
    subject: heading,
    html: layout({
      preheader: valid,
      heading,
      body: `${paragraph(lead)}${codeBox(t.code)}${paragraph(valid)}${paragraph(warning)}`,
      footer: AUTOMATED_FOOTER,
    }),
    text: [heading, "", lead, "", t.code, "", valid, warning, "", AUTOMATED_FOOTER].join("\n"),
  };
}

function renderReceipt(t: Extract<EmailTemplate, { kind: "PAYMENT_RECEIPT" }>): EmailMessage {
  const amount = formatMoney(t.amountMinor, t.currency);
  const paidAt = formatDateTime(t.paidAt);
  const until = formatDateTime(t.refundableUntil);
  const heading = "تم الدفع وتفعيل اشتراكك";
  const lead = `شكرًا لاشتراكك في QUP. دفعتك مؤكدة، واشتراكك في «${t.planName}» مفعّل الآن.`;
  const refund = `يمكنك طلب استرجاع كامل المبلغ حتى ${until}، عبر وسائل التواصل في المنصة.`;
  return {
    subject: `تأكيد الدفع — ${t.planName}`,
    html: layout({
      preheader: `تم تأكيد دفع ${amount} وتفعيل اشتراكك.`,
      heading,
      body: `${paragraph(lead)}${details([
        ["الباقة", t.planName],
        ["المبلغ", amount],
        ["تاريخ الدفع", paidAt],
      ])}${t.appUrl ? button("ابدأ التدريب", `${t.appUrl}/dashboard`) : ""}${paragraph(refund)}`,
      footer: AUTOMATED_FOOTER,
    }),
    text: [
      heading,
      "",
      lead,
      "",
      `الباقة: ${t.planName}`,
      `المبلغ: ${amount}`,
      `تاريخ الدفع: ${paidAt}`,
      "",
      refund,
      ...(t.appUrl ? ["", `${t.appUrl}/dashboard`] : []),
      "",
      AUTOMATED_FOOTER,
    ].join("\n"),
  };
}

function renderRefunded(t: Extract<EmailTemplate, { kind: "PAYMENT_REFUNDED" }>): EmailMessage {
  const amount = formatMoney(t.amountMinor, t.currency);
  const heading = "تم استرجاع مبلغ اشتراكك";
  const lead = `استُرجع مبلغ ${amount} لاشتراكك في «${t.planName}» إلى وسيلة الدفع الأصلية، وأُنهي الاشتراك. قد يستغرق ظهور المبلغ لدى البنك بضعة أيام.`;
  const note = "تبقى إجاباتك وملف مهاراتك محفوظين في حسابك.";
  return {
    subject: `تم استرجاع المبلغ — ${t.planName}`,
    html: layout({
      preheader: `استُرجع ${amount} إلى وسيلة الدفع الأصلية.`,
      heading,
      body: `${paragraph(lead)}${paragraph(note)}`,
      footer: AUTOMATED_FOOTER,
    }),
    text: [heading, "", lead, note, "", AUTOMATED_FOOTER].join("\n"),
  };
}

function renderPasswordChanged(
  t: Extract<EmailTemplate, { kind: "PASSWORD_CHANGED" }>,
): EmailMessage {
  const when = formatDateTime(t.changedAt);
  const heading = "تم تغيير كلمة مرور حسابك";
  const lead = `تم تغيير كلمة مرور حسابك في QUP بتاريخ ${when}، وسُجّل خروجك من الأجهزة الأخرى.`;
  const warning =
    "إذا كنت أنت من غيّرها فلا يلزم أي إجراء. وإذا لم تكن أنت، فاستعد حسابك فورًا من «نسيت كلمة المرور» وتواصل معنا.";
  return {
    subject: heading,
    html: layout({
      preheader: lead,
      heading,
      body: `${paragraph(lead)}${paragraph(warning)}${t.appUrl ? button("استعادة الحساب", `${t.appUrl}/forgot-password`) : ""}`,
      footer: AUTOMATED_FOOTER,
    }),
    text: [
      heading,
      "",
      lead,
      warning,
      ...(t.appUrl ? ["", `${t.appUrl}/forgot-password`] : []),
      "",
      AUTOMATED_FOOTER,
    ].join("\n"),
  };
}

function renderSubscriptionEnding(
  t: Extract<EmailTemplate, { kind: "SUBSCRIPTION_ENDING" }>,
): EmailMessage {
  const when = formatDateTime(t.endsAt);
  const heading = `اشتراكك في «${t.examName}» ينتهي قريبًا`;
  const lead = `ينتهي اشتراكك في «${t.examName}» بتاريخ ${when}. جدّده قبل ذلك ليستمر تدريبك دون انقطاع.`;
  const note =
    "لا يتجدد الاشتراك تلقائيًا، ولن يُخصم منك شيء دون أن تختار. إجاباتك وملف مهاراتك يبقيان في حسابك.";
  return {
    subject: heading,
    html: layout({
      preheader: lead,
      heading,
      body: `${paragraph(lead)}${t.appUrl ? button("جدّد الاشتراك", `${t.appUrl}/subscriptions`) : ""}${paragraph(note)}`,
      footer: AUTOMATED_FOOTER,
    }),
    text: [
      heading,
      "",
      lead,
      note,
      ...(t.appUrl ? ["", `${t.appUrl}/subscriptions`] : []),
      "",
      AUTOMATED_FOOTER,
    ].join("\n"),
  };
}

export function renderEmail(template: EmailTemplate): EmailMessage {
  switch (template.kind) {
    case "OTP":
      return renderOtp(template);
    case "PAYMENT_RECEIPT":
      return renderReceipt(template);
    case "PAYMENT_REFUNDED":
      return renderRefunded(template);
    case "PASSWORD_CHANGED":
      return renderPasswordChanged(template);
    case "SUBSCRIPTION_ENDING":
      return renderSubscriptionEnding(template);
  }
}
