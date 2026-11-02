"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Icon } from "@/components/icon";
import { parseScore, WEIGHT_PRESETS, type Weights, weightedScore } from "@/lib/weighted-score";

const PROBLEMS = {
  WEIGHTS_NOT_100: "مجموع الأوزان يجب أن يكون 100.",
  MISSING_SCORE: "أكمل الدرجات المطلوبة لحساب النسبة.",
  OUT_OF_RANGE: "كل درجة ووزن بين 0 و100.",
} as const;

const FIELDS = [
  { key: "highSchool", label: "معدل الثانوية", hint: "النسبة المئوية" },
  { key: "aptitude", label: "درجة القدرات", hint: "من 100" },
  { key: "achievement", label: "درجة التحصيلي", hint: "من 100" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

export function WeightedScoreCalculator() {
  const id = useId();
  const [scores, setScores] = useState<Record<Key, string>>({
    highSchool: "",
    aptitude: "",
    achievement: "",
  });
  const [weights, setWeights] = useState<Weights>(
    WEIGHT_PRESETS[0]?.weights ?? { highSchool: 30, aptitude: 30, achievement: 40 },
  );

  const result = weightedScore(
    {
      highSchool: parseScore(scores.highSchool),
      aptitude: parseScore(scores.aptitude),
      achievement: parseScore(scores.achievement),
    },
    weights,
  );
  const presetId = WEIGHT_PRESETS.find(
    (preset) =>
      preset.weights.highSchool === weights.highSchool &&
      preset.weights.aptitude === weights.aptitude &&
      preset.weights.achievement === weights.achievement,
  )?.id;
  const started = Object.values(scores).some((value) => value.trim() !== "");

  return (
    <div className="calculator">
      <section className="card stack" aria-labelledby={`${id}-scores`}>
        <h2 id={`${id}-scores`}>درجاتك</h2>
        <div className="calculator__fields">
          {FIELDS.map((field) => (
            <div key={field.key} className="field">
              <label className="field__label" htmlFor={`${id}-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`${id}-${field.key}`}
                className="field__input"
                inputMode="decimal"
                autoComplete="off"
                placeholder={weights[field.key] === 0 ? "غير مطلوب" : "مثال: 85"}
                value={scores[field.key]}
                onChange={(event) =>
                  setScores((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
              <p className="field__hint">{field.hint}</p>
            </div>
          ))}
        </div>

        <fieldset className="field">
          <legend className="field__label">الأوزان</legend>
          <div className="chip-group">
            {WEIGHT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="chip"
                aria-pressed={presetId === preset.id}
                onClick={() => setWeights(preset.weights)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </fieldset>
        <details className="calculator__custom">
          <summary className="small">أوزان مخصصة لجامعتك</summary>
          <div className="calculator__fields">
            {FIELDS.map((field) => (
              <div key={field.key} className="field">
                <label className="field__label" htmlFor={`${id}-w-${field.key}`}>
                  وزن {field.label} ٪
                </label>
                <input
                  id={`${id}-w-${field.key}`}
                  className="field__input"
                  inputMode="decimal"
                  value={String(weights[field.key])}
                  onChange={(event) =>
                    setWeights((current) => ({
                      ...current,
                      [field.key]: parseScore(event.target.value) ?? 0,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </details>
      </section>

      <section
        className="card calculator__result"
        aria-live="polite"
        aria-labelledby={`${id}-result`}
      >
        <h2 id={`${id}-result`}>نسبتك الموزونة</h2>
        {result.ok ? (
          <>
            <p className="calculator__score">
              <strong>{started ? result.score.toFixed(2) : "—"}</strong>
              <span>٪</span>
            </p>
            {started ? (
              <ul className="calculator__parts small">
                {FIELDS.filter((field) => weights[field.key] > 0).map((field) => (
                  <li key={field.key}>
                    <span>{field.label}</span>
                    <span>{result.parts[field.key].toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="muted">
            {started ? PROBLEMS[result.problem] : "اكتب درجاتك لتظهر النسبة."}
          </p>
        )}
        <p className="small muted">
          الأوزان تختلف بين الجامعات والكليات وتتغير سنويًا؛ تأكد منها في دليل القبول الرسمي.
        </p>
        <div className="calculator__cta stack">
          <strong>تريد رفع درجة القدرات؟</strong>
          <span className="small">ابدأ بتشخيص مجاني يكشف المهارات التي تخسر فيها أكثر درجاتك.</span>
          <Link href="/register" className="btn btn--gold">
            ابدأ التشخيص المجاني <Icon name="arrow" />
          </Link>
        </div>
      </section>
    </div>
  );
}
