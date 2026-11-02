"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { MistakeTutor } from "@/components/mistake-tutor";
import { PageHeading } from "@/components/page-heading";
import { RichContent } from "@/components/rich-content";
import { ErrorNotice, Loading } from "@/components/status";
import { getMockResult, getSession, type MockExamResult, type MockReviewItem } from "@/lib/api";
import { optionLetter } from "@/lib/diagnostics";
import { accuracyText } from "@/lib/full-reassessment";
import { durationText, type ReviewFilter, reviewFilterMatches } from "@/lib/mock-exam";
import { useRequireUser } from "@/lib/session";

const PERCENT = 100;
/** Below half right, a skill's bar is drawn as a weakness. */
const WEAK_SHARE = 0.5;

const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: "WRONG", label: "أخطائي" },
  { value: "NOT_ANSWERED", label: "لم أجب عنها" },
  { value: "ALL", label: "كل الأسئلة" },
];

/** A finished mock exam: the score, each skill weakest first, then every question reviewed. */
export default function MockResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const user = useRequireUser();
  const result = useQuery({
    queryKey: ["mock-result", user?.id, sessionId],
    queryFn: () => getMockResult(sessionId),
    enabled: user !== null,
  });
  const session = useQuery({
    queryKey: ["session", user?.id, sessionId],
    queryFn: () => getSession(sessionId),
    enabled: user !== null,
  });
  const examId = session.data?.examId;

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="نتيجة الاختبار المحاكي"
        description="نتيجتك بظروف الاختبار الحقيقي، ثم مراجعة كل سؤال بإجابته الصحيحة وشرحه."
      />
      {result.isPending ? <Loading label="جارٍ حساب نتيجتك…" /> : null}
      {result.isError ? <ErrorNotice error={result.error} /> : null}
      {result.data ? <Summary result={result.data} /> : null}
      {examId ? (
        <div className="row">
          <Link href={`/exams/${examId}/training`} className="btn">
            تدرّب على أضعف مهاراتك
          </Link>
          <Link href={`/exams/${examId}/profile`} className="btn btn--ghost">
            ملف مهاراتي
          </Link>
        </div>
      ) : null}
      {result.data && examId ? <Review examId={examId} items={result.data.review} /> : null}
    </main>
  );
}

function Summary({ result }: { result: MockExamResult }) {
  const duration = durationText(result.startedAt, result.completedAt);
  return (
    <>
      <ul className="profile-summary" aria-label="النتيجة الإجمالية">
        <li>
          <strong>{accuracyText(result.correct, result.total)}</strong>
          <span>{`${result.correct} صحيحة من ${result.total}`}</span>
        </li>
        <li>
          <strong>{result.answered}</strong>
          <span>{`سؤالًا أجبت عنه من ${result.total}`}</span>
        </li>
        {duration ? (
          <li>
            <strong>{duration}</strong>
            <span>مدة الحل</span>
          </li>
        ) : null}
      </ul>

      <section className="card stack" aria-labelledby="mock-skills-heading">
        <h2 id="mock-skills-heading">حسب المهارة</h2>
        <p className="small muted">الأضعف أولًا: هنا تفيدك ساعة المذاكرة القادمة أكثر.</p>
        <ul className="list">
          {result.skills.map((skill) => (
            <li key={skill.skillId} className="list__item skill-score">
              <span className="skill-score__name">{skill.skillName}</span>
              <span
                className="progress skill-score__bar"
                role="img"
                aria-label={`${skill.correct} صحيحة من ${skill.total}`}
              >
                <span
                  className={`progress__bar${skill.correct / skill.total < WEAK_SHARE ? " progress__bar--weak" : ""}`}
                  style={{ width: `${(skill.correct / skill.total) * PERCENT}%` }}
                />
              </span>
              <span className="small">{`${skill.correct}/${skill.total}`}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Review({ examId, items }: { examId: string; items: MockReviewItem[] }) {
  const [filter, setFilter] = useState<ReviewFilter>("WRONG");
  const shown = items.filter((item) => reviewFilterMatches(item.outcome, filter));
  return (
    <section className="stack" aria-labelledby="mock-review-heading">
      <h2 id="mock-review-heading">مراجعة الأسئلة</h2>
      <fieldset className="chip-group">
        <legend className="visually-hidden">عرض الأسئلة</legend>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label} (
            {items.filter((i) => reviewFilterMatches(i.outcome, option.value)).length})
          </button>
        ))}
      </fieldset>
      {shown.length === 0 ? (
        <p className="notice notice--success">لا توجد أسئلة هنا. أحسنت!</p>
      ) : (
        <ol className="mistake-list">
          {shown.map((item) => (
            <ReviewCard key={item.ordinal} examId={examId} item={item} />
          ))}
        </ol>
      )}
    </section>
  );
}

const OUTCOME_LABELS: Record<MockReviewItem["outcome"], string> = {
  CORRECT: "صحيحة",
  INCORRECT: "خاطئة",
  NOT_ANSWERED: "لم تُجب",
};

function ReviewCard({ examId, item }: { examId: string; item: MockReviewItem }) {
  return (
    <li className="card mistake-card stack">
      <div className="mistake-card__meta">
        <span className="small">{`السؤال ${item.ordinal}`}</span>
        {item.skillName ? <span className="badge">{item.skillName}</span> : null}
        <span className={`outcome-tag outcome-tag--${item.outcome.toLowerCase()}`}>
          {OUTCOME_LABELS[item.outcome]}
        </span>
      </div>
      <div className="mistake-card__stem">
        <RichContent content={item.question.stem} />
      </div>
      <ul className="mistake-options">
        {item.question.options.map((option, index) => {
          const correct = item.correctOptionKeys.includes(option.key);
          const chosen = item.chosenKeys.includes(option.key);
          const state = correct ? "option--correct" : chosen ? "option--wrong" : "";
          return (
            <li key={option.key} className={`option option--static ${state}`}>
              <span className="option__content">
                <RichContent content={option.content} />
              </span>
              {correct ? <span className="mistake-tag">الإجابة الصحيحة</span> : null}
              {chosen && !correct ? <span className="mistake-tag">إجابتك</span> : null}
              <span className="option-key">{optionLetter(index)}</span>
            </li>
          );
        })}
      </ul>
      {item.explanation ? (
        <details className="mistake-explanation">
          <summary>عرض الشرح</summary>
          <RichContent content={item.explanation} />
        </details>
      ) : null}
      {item.outcome === "INCORRECT" ? (
        <MistakeTutor examId={examId} questionVersionId={item.question.questionVersionId} />
      ) : null}
    </li>
  );
}
