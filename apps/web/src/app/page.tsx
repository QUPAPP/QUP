import Link from "next/link";

const STEPS = [
  { title: "تشخيص مصغّر مجاني", body: "أسئلة قليلة مختارة بعناية تعطيك قراءة أولية لمستواك." },
  { title: "نتيجة واضحة", body: "مستواك التشخيصي، وأبرز نقاط قوتك وما يحتاج تدريبًا." },
  {
    title: "تدريب على ما تحتاجه",
    body: "التشخيص الكامل يحدد الفواقد بالتفصيل ويبني تدريبك عليها.",
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className="hero">
        <div className="hero__inner">
          <h1>اعرف مستواك الحقيقي، وتدرّب على ما تحتاجه فعلًا</h1>
          <p>
            QUP يشخّص مستواك في القدرات والتحصيلي وSTEP، ثم يركّز تدريبك على المهارات التي تحتاجها أنت
            — لا على ما تتقنه أصلًا.
          </p>
          <div className="row">
            <Link href="/register" className="btn btn--gold">
              ابدأ التشخيص المجاني
            </Link>
            <Link href="/login" className="btn btn--on-dark">
              لدي حساب
            </Link>
          </div>
        </div>
      </section>

      <div className="page stack stack--loose">
        <h2>كيف يعمل؟</h2>
        <ol className="stack">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card stack">
              <h3>
                {index + 1}. {step.title}
              </h3>
              <p className="muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
