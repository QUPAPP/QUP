import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { CONTACT_REASONS, mailtoFor } from "@/lib/contact";
import { LEGAL_CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "الدعم، طلبات الاسترجاع، مشاكل الحساب والدفع، وطلبات البيانات الشخصية.",
};

export default function ContactPage() {
  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="تواصل معنا"
        description="اختر سبب تواصلك، فيُفتح لك بريد جاهز بما نحتاجه لنساعدك من أول رد."
      />
      <ul className="contact-reasons" aria-label="أسباب التواصل">
        {CONTACT_REASONS.map((reason) => (
          <li key={reason.id} className="card stack">
            <h2>{reason.title}</h2>
            <p className="small muted">{reason.description}</p>
            <a className="btn btn--small btn--ghost" href={mailtoFor(reason)}>
              اكتب لنا
            </a>
          </li>
        ))}
      </ul>
      <section className="card stack" aria-labelledby="contact-direct">
        <h2 id="contact-direct">وسائل التواصل</h2>
        <dl className="profile-facts">
          <div>
            <dt>البريد الإلكتروني</dt>
            <dd>
              <a href={`mailto:${LEGAL_CONTACT.email}`} dir="ltr">
                {LEGAL_CONTACT.email}
              </a>
            </dd>
          </div>
          <div>
            <dt>رقم التواصل</dt>
            <dd>
              <a href={`tel:${LEGAL_CONTACT.phoneInternational}`} dir="ltr">
                {LEGAL_CONTACT.phone}
              </a>
            </dd>
          </div>
        </dl>
        <p className="small muted">
          لا نطلب منك أبدًا كلمة المرور أو رقم البطاقة كاملًا. اطّلع على{" "}
          <Link href="/refund">سياسة الاسترجاع</Link> و<Link href="/privacy">سياسة الخصوصية</Link>.
        </p>
      </section>
    </main>
  );
}
