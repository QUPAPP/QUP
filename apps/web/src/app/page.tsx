import Link from "next/link";
import { Icon } from "@/components/icon";

const steps = [
  {
    title: "ابدأ بتشخيصك",
    body: "اختر اختبارك وأجب عن التشخيص المصغّر المجاني. أسئلة مختارة تعطيك نقطة بداية واضحة.",
    icon: "compass" as const,
  },
  {
    title: "افهم نتيجتك",
    body: "تعرّف على مستواك التشخيصي، وأبرز نقاط قوتك والمهارات التي تحتاج إلى تدريب.",
    icon: "chart" as const,
  },
  {
    title: "ارجع وأكمل",
    body: "جلساتك محفوظة في مساحتك. استكمل من آخر سؤال، وارجع إلى نتائجك وقتما تحتاج.",
    icon: "book" as const,
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
    <main id="main-content">
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="hero-copy">
            <h1>
              خطوتك القادمة،
              <br />
              تبدأ <span>بفهم مستواك.</span>
            </h1>
            <p>
              وقتُك يستحق بداية أوضح. اكتشف نقاط قوتك، وتعرّف على ما يحتاج إلى تركيز، بتشخيص مصغّر يضعك
              على أول الطريق.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="btn btn--gold btn--large">
                ابدأ التشخيص المجاني <Icon name="arrow" />
              </Link>
              <a href="#how-it-works" className="text-link">
                اكتشف كيف يعمل <Icon name="chevron" />
              </a>
            </div>
            <div className="hero-assurance">
              <span>
                <Icon name="check" />
                حساب مجاني
              </span>
              <span>
                <Icon name="check" />
                نتيجة بعد التشخيص
              </span>
              <span>
                <Icon name="check" />
                أكمل على راحتك
              </span>
            </div>
          </div>
          <section className="journey-visual" aria-label="رحلتك مع QUP">
            <div className="journey-top">
              <span className="journey-brand" dir="ltr">
                QUP.
              </span>
              <span>لكل خطوة معنى</span>
            </div>
            <div className="journey-title">
              من أين أبدأ؟
              <br />
              <span>من هنا.</span>
            </div>
            <ol className="journey-track">
              <li>
                <span className="journey-node">
                  <Icon name="compass" />
                </span>
                <div>
                  <strong>اكتشف مستواك</strong>
                  <span>تشخيص مصغّر مجاني</span>
                </div>
                <Icon name="check" />
              </li>
              <li>
                <span className="journey-node">
                  <Icon name="chart" />
                </span>
                <div>
                  <strong>كوّن صورة أوضح</strong>
                  <span>نقاط قوتك وما يحتاج إلى تدريب</span>
                </div>
              </li>
              <li>
                <span className="journey-node">
                  <Icon name="book" />
                </span>
                <div>
                  <strong>تابع خطوتك التالية</strong>
                  <span>جلساتك ونتائجك، في مكان واحد</span>
                </div>
              </li>
            </ol>
            <div className="journey-bottom">
              <span className="journey-dot" />
              رحلة تتعلّم فيها عن نفسك
            </div>
            <span className="journey-decoration" aria-hidden="true">
              Q
            </span>
          </section>
        </div>
      </section>

      <section className="principles-strip" id="why-qup" aria-label="فكرة QUP">
        <div>
          <strong>وضوح قبل البداية.</strong>
          <p>اعرف أين تقف، قبل أن تقرر أين تذهب.</p>
        </div>
        <div>
          <strong>التركيز على احتياجك.</strong>
          <p>افهم ما تتقنه وما يحتاج إلى مزيد من التدريب.</p>
        </div>
        <div>
          <strong>تعلّم يناسب وقتك.</strong>
          <p>ارجع إلى جلستك المحفوظة، وأكمل خطوتك.</p>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-heading">
          <h2>
            بداية بسيطة.
            <br />
            وصورة أوضح عنك.
          </h2>
          <p className="muted">
            ما تحتاج تبدأ بكل شيء.
            <br />
            ابدأ بخطوة تعرف بعدها نفسك أكثر.
          </p>
        </div>
        <ol className="steps-layout">
          {steps.map((step, index) => (
            <li key={step.title}>
              <div className="step-top">
                <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                <Icon name={step.icon} />
              </div>
              <h3>{step.title}</h3>
              <p className="muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section faq-section" id="questions">
        <div className="section-heading">
          <h2>
            قبل أن تبدأ،
            <br />
            خلّ الصورة واضحة.
          </h2>
          <p className="muted">إجابات قصيرة على أسئلتك الأولى.</p>
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

      <section className="closing-cta">
        <div>
          <h2>أول خطوة تستحقها.</h2>
          <p>ابدأ التشخيص المصغّر، واكتشف نقطة بدايتك.</p>
        </div>
        <Link href="/register" className="btn btn--gold btn--large">
          لنبدأ معًا <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
