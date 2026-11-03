import type { ReactNode } from "react";
import { Brand } from "./brand";

const firstSteps = [
  { title: "أنشئ حسابك", body: "بالبريد أو برقم الجوال، بلا رسوم." },
  { title: "التشخيص المصغّر", body: "أسئلة قليلة من أقسام الاختبار، مجانًا." },
  { title: "نتيجتك المبدئية", body: "أبرز نقاط قوتك وما يحتاج إلى تدريب، فور الإكمال." },
];

export function AuthLayout({
  children,
  register = false,
}: {
  children: ReactNode;
  register?: boolean;
}) {
  return (
    <main id="main-content" className="auth-layout">
      <aside className="auth-story">
        <Brand tone="light" tagline={false} />
        <div className="auth-story__body">
          <h2>{register ? "ثلاث خطوات إلى أول قراءة لمستواك." : "أكمل من حيث توقفت."}</h2>
          {register ? (
            <ol className="auth-story__steps">
              {firstSteps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              جلساتك ونتائجك وملف مهاراتك محفوظة في حسابك. الإجابات التي أكدتها لا تضيع، والجلسة
              المفتوحة تنتظرك من السؤال التالي.
            </p>
          )}
        </div>
        <p className="auth-story__foot">خير معين لمستقبلك</p>
      </aside>
      <div className="auth-panel">
        <div className="auth-panel__brand">
          <Brand tagline={false} />
        </div>
        {children}
      </div>
    </main>
  );
}
