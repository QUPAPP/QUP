import Link from "next/link";
import { Fold } from "@/components/fold";
import { Icon } from "@/components/icon";
import { SampleSkillMap } from "@/components/sample-skill-map";

/** What sets QUP apart: product rules the platform enforces, not marketing numbers. */
const principles: { title: string; body: string; earned?: boolean }[] = [
  {
    title: "كل سؤال يقيس مهارة محددة",
    body: "فتعرف بالضبط أي مهارة رفعت نتيجتك وأيها خذلتك.",
  },
  {
    title: "تدريب يختار أسئلتك بسبب واضح",
    body: "كل سؤال مختار لمهارة تحتاجها الآن، ونعرض لك اسمها قبل أن تجيب.",
  },
  {
    title: "الإتقان يُثبت ولا يُفترض",
    body: "لا نعتبر المهارة متقنة لأن نسبتك ارتفعت؛ نؤكدها بإعادة قياس تنجح فيها.",
    earned: true,
  },
];

const steps: { title: string; body: string; note: string }[] = [
  {
    title: "التشخيص المصغّر",
    body: "أسئلة قليلة مختارة من أقسام الاختبار، تعطيك قراءة أولى لمستواك.",
    note: "مجاني",
  },
  {
    title: "ملف مهاراتك",
    body: "كل مهارة بحالتها: متقنة، أو جاهزة، أو فجوة تحتاج تركيزًا.",
    note: "ضمن الباقة",
  },
  {
    title: "تدريب على الفواقد",
    body: "جلسات قصيرة تبدأ بأكبر فجوة عندك، وتنتقل معك كلما تحسّنت.",
    note: "ضمن الباقة",
  },
  {
    title: "إعادة القياس",
    body: "حين تصبح المهارة جاهزة، تثبت إتقانها بأسئلة جديدة عليك.",
    note: "ضمن الباقة",
  },
];

const questions = [
  {
    question: "هل أستطيع البدء مجانًا؟",
    answer:
      "نعم. أنشئ حسابًا، واختر اختبارك، ثم ابدأ التشخيص المصغّر المجاني. ستظهر لك نتيجة مبدئية بعد إكماله.",
  },
  {
    question: "ماذا تعني نتيجة التشخيص؟",
    answer:
      "هي قراءة أولية لأدائك في الأسئلة التي أجبت عنها، مع أبرز نقاط القوة والمهارات التي تحتاج إلى تدريب. ليست درجة متوقعة في الاختبار الرسمي.",
  },
  {
    question: "هل أقدر أكمل جلستي لاحقًا؟",
    answer:
      "نعم. الإجابات التي تؤكدها تُحفظ في حسابك. من صفحة جلساتي تستطيع العودة إلى الجلسة نفسها ومتابعة الأسئلة المتبقية.",
  },
  {
    question: "هل الباقة تشمل كل الاختبارات؟",
    answer:
      "لكل اختبار باقاته المستقلة. تجد السعر والمدة المتاحين في صفحة الباقات قبل إتمام الدفع.",
  },
];

export default function LandingPage() {
  return (
    <main id="main-content" className="home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero__copy">
          <p className="eyebrow">القدرات · التحصيلي · STEP</p>
          <h1 id="home-title">
            أكثر من مجرد تدريب.
            <span>نكتشف الفاقد، ونعالجه خطوة بخطوة.</span>
          </h1>
          <p className="hero__lead">
            تشخيص مصغّر مجاني يحدد موقعك في كل مهارة، ثم تدريب على ما تحتاجه فعلًا، لا على ما تتقنه
            أصلًا.
          </p>
          <div className="hero__actions">
            <Link href="/register" className="btn btn--large">
              ابدأ التشخيص المجاني <Icon name="arrow" />
            </Link>
            <a href="#how-it-works" className="text-link">
              شاهد كيف يعمل
            </a>
          </div>
          <p className="hero__assurance">
            حساب مجاني <span aria-hidden="true">·</span> نتيجة فور إكمال التشخيص{" "}
            <span aria-hidden="true">·</span> جلساتك محفوظة
          </p>
        </div>
        <SampleSkillMap />
      </section>

      <section className="loop" id="how-it-works" aria-labelledby="loop-title">
        <div className="loop__inner">
          <div className="loop__head">
            <div>
              <p className="eyebrow">كيف يعمل</p>
              <h2 id="loop-title">من أول سؤال إلى مهارة متقنة.</h2>
            </div>
            <p>
              دورة واحدة تتكرر لكل مهارة: نقيس، نرتّب، ندرّب، ثم نقيس مرة أخرى قبل أن نقول إنك
              أتقنتها.
            </p>
          </div>
          <ol className="loop__steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <h3 className="loop__seg">
                  <span className="loop__num">{index + 1}</span>
                  {step.title}
                  {index === steps.length - 1 ? <Fold /> : null}
                </h3>
                <p>{step.body}</p>
                <span className="loop__note">{step.note}</span>
              </li>
            ))}
          </ol>
          <ul className="principles" id="why-qup" aria-label="لماذا QUP">
            {principles.map((item) => (
              <li key={item.title}>
                <h3>
                  {item.earned ? <Fold /> : null}
                  {item.title}
                </h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-faq" id="questions" aria-labelledby="faq-title">
        <div className="home-section-head">
          <p className="eyebrow">أسئلة شائعة</p>
          <h2 id="faq-title">قبل أن تبدأ.</h2>
          <p className="muted">إجابات قصيرة على أكثر ما يُسأل عنه.</p>
        </div>
        <div className="faq-list">
          {questions.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <Icon name="plus" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="home-closing" aria-labelledby="closing-title">
        <div>
          <h2 id="closing-title">ابدأ بخطوة صغيرة، وارجع لهدفك الكبير.</h2>
          <p>التشخيص المصغّر مجاني، ونتيجته تظهر فور إكماله.</p>
        </div>
        <Link href="/register" className="btn btn--light btn--large">
          ابدأ التشخيص المجاني <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
