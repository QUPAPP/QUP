import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { SampleSkillMap } from "@/components/sample-skill-map";

/** What sets QUP apart: product rules the platform enforces, not marketing numbers. */
const principles: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "target",
    title: "كل سؤال يقيس مهارة محددة",
    body: "الأسئلة مربوطة بمهارات الاختبار، فتعرف بالضبط أي مهارة رفعت نتيجتك وأيها خذلتك.",
  },
  {
    icon: "compass",
    title: "تدريب يختار أسئلتك بسبب واضح",
    body: "كل سؤال في التدريب مختار لمهارة تحتاجها الآن، ونعرض لك اسمها قبل أن تجيب.",
  },
  {
    icon: "shield",
    title: "الإتقان يُثبت ولا يُفترض",
    body: "لا نعتبر المهارة متقنة لأن نسبتك ارتفعت؛ نؤكدها بإعادة قياس تنجح فيها.",
  },
];

const steps: { icon: IconName; title: string; body: string; note: string }[] = [
  {
    icon: "compass",
    title: "التشخيص المصغّر",
    body: "أسئلة قليلة مختارة من أقسام الاختبار، تعطيك قراءة أولى لمستواك.",
    note: "مجاني",
  },
  {
    icon: "layers",
    title: "ملف مهاراتك",
    body: "كل مهارة بحالتها: متقنة، أو قيد التحسّن، أو فجوة تحتاج تركيزًا.",
    note: "ضمن الباقة",
  },
  {
    icon: "target",
    title: "تدريب على الفواقد",
    body: "جلسات قصيرة تبدأ بأكبر فجوة عندك، وتنتقل معك كلما تحسّنت.",
    note: "ضمن الباقة",
  },
  {
    icon: "flag",
    title: "إعادة القياس",
    body: "حين تصبح المهارة جاهزة، تثبت إتقانها بأسئلة جديدة عليك.",
    note: "ضمن الباقة",
  },
];

const dashboardAnswers = [
  { title: "أين أنت الآن؟", body: "كم مهارة قيست، وكم منها متقنة." },
  { title: "ما نقاط قوتك؟", body: "المهارات التي تثبت فيها مستواك." },
  { title: "أين الفواقد؟", body: "مرتبة من الأحوج إلى التدريب." },
  { title: "ماذا تفعل الآن؟", body: "خطوة واحدة واضحة، نختارها لك." },
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
      <section className="home-hero" aria-labelledby="home-title">
        <Image
          src="/brand/qup-mountain-journey.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="home-hero__photo"
        />
        <div className="home-hero__shade" aria-hidden="true" />
        <div className="home-hero__inner">
          <div className="home-hero__copy">
            <p className="eyebrow eyebrow--on-dark">تشخيص · تدريب · إعادة قياس</p>
            <h1 id="home-title">
              أكثر من مجرد تدريب.
              <span>نكتشف الفاقد، ونعالجه خطوة بخطوة.</span>
            </h1>
            <p className="home-hero__lead">
              ابدأ بتشخيص مصغّر مجاني يحدد موقعك في كل مهارة، ثم تدرّب على ما تحتاجه فعلًا، لا على ما
              تتقنه أصلًا.
            </p>
            <div className="home-hero__actions">
              <Link href="/register" className="btn btn--gold btn--large">
                ابدأ التشخيص المجاني <Icon name="arrow" />
              </Link>
              <a href="#how-it-works" className="btn btn--on-dark btn--large">
                كيف يعمل
              </a>
            </div>
            <ul className="home-hero__assurance">
              <li>
                <Icon name="check" />
                حساب مجاني
              </li>
              <li>
                <Icon name="check" />
                نتيجة فور إكمال التشخيص
              </li>
              <li>
                <Icon name="check" />
                جلساتك محفوظة
              </li>
            </ul>
          </div>
          <SampleSkillMap />
        </div>
      </section>

      <section className="home-principles" id="why-qup" aria-labelledby="principles-title">
        <div className="home-principles__intro">
          <p className="eyebrow">لماذا QUP؟</p>
          <h2 id="principles-title">
            نتيجة واحدة لا تكفي.
            <br />
            تحتاج أن تعرف لماذا.
          </h2>
        </div>
        <ul className="home-principles__list">
          {principles.map((item) => (
            <li key={item.title}>
              <span className="glyph">
                <Icon name={item.icon} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-steps" id="how-it-works" aria-labelledby="steps-title">
        <div className="home-section-head">
          <p className="eyebrow">كيف يعمل</p>
          <h2 id="steps-title">أربع خطوات، من أول سؤال إلى إتقان المهارة.</h2>
        </div>
        <ol className="home-steps__track">
          {steps.map((step, index) => (
            <li key={step.title}>
              <div className="home-steps__marker">
                <span className="home-steps__index">{index + 1}</span>
                <Icon name={step.icon} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="home-steps__note">{step.note}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-report" id="report" aria-labelledby="report-title">
        <div className="home-report__copy">
          <p className="eyebrow">مساحتك</p>
          <h2 id="report-title">لوحة تجيبك عن أربعة أسئلة، كل مرة تدخل.</h2>
          <dl className="home-report__answers">
            {dashboardAnswers.map((item) => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>{item.body}</dd>
              </div>
            ))}
          </dl>
          <Link href="/register" className="btn btn--large">
            أنشئ حسابك <Icon name="arrow" />
          </Link>
        </div>
        <div className="home-report__visual">
          <Image
            src="/brand/qup-mountain-journey-1200.webp"
            alt=""
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            className="home-report__photo"
          />
          <div className="home-report__panel">
            <span className="sample-tag">مثال توضيحي</span>
            <p className="home-report__panel-label">خطوتك التالية</p>
            <strong>تدرّب على: استيعاب المقروء</strong>
            <p className="home-report__panel-note">أكبر فجوة في ملفك الآن، وفيها 4 أسئلة تنتظرك.</p>
            <span className="btn btn--gold btn--small" aria-hidden="true">
              ابدأ التدريب <Icon name="arrow" />
            </span>
          </div>
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
        <Link href="/register" className="btn btn--gold btn--large">
          ابدأ الآن <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
