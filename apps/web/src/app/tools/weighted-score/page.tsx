import type { Metadata } from "next";

import { WeightedScoreCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "حاسبة النسبة الموزونة | QUP",
  description:
    "احسب نسبتك الموزونة للقبول الجامعي من معدل الثانوية ودرجتي القدرات والتحصيلي، بأوزان جامعتك.",
};

export default function WeightedScorePage() {
  return (
    <main id="main-content" className="page page--narrow stack stack--loose">
      <header className="stack">
        <p className="eyebrow">أداة مجانية</p>
        <h1>حاسبة النسبة الموزونة</h1>
        <p className="muted">
          اكتب معدلك ودرجاتك، واختر أوزان الجامعة أو الكلية التي تستهدفها. الحساب يتم في متصفحك ولا
          نحفظ شيئًا.
        </p>
      </header>
      <WeightedScoreCalculator />
    </main>
  );
}
