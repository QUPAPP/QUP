"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { RichContent } from "@/components/rich-content";
import { ErrorNotice, Loading } from "@/components/status";
import { getTrainingMistakes, isApiError, type TrainingMistake } from "@/lib/api";
import { optionLetter } from "@/lib/diagnostics";
import { formatDate } from "@/lib/format";
import { filterMistakes, mistakeSkills } from "@/lib/mistakes";
import { useRequireUser } from "@/lib/session";

export default function MistakesPage() {
  const { examId } = useParams<{ examId: string }>();
  const user = useRequireUser();
  const mistakes = useQuery({
    queryKey: ["training-mistakes", user?.id, examId],
    queryFn: () => getTrainingMistakes(examId),
    enabled: user !== null,
    retry: false,
  });

  if (isApiError(mistakes.error, "TRAINING_REQUIRES_ACCESS")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="مراجعة الأخطاء ضمن الباقة"
          description="بعد الاشتراك تتدرّب على فجواتك، وتجد هنا كل سؤال أخطأت فيه مع الإجابة الصحيحة وشرحها."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="مراجعة أخطائي"
        description="الأسئلة التي أخطأت فيها أثناء التدريب، مع إجابتك والإجابة الصحيحة وشرحها. راجعها قبل جلستك القادمة."
        action={
          <Link href={`/exams/${examId}/profile`} className="text-link">
            ملف مهاراتي <Icon name="chevron" />
          </Link>
        }
      />
      {mistakes.isPending ? <Loading /> : null}
      {mistakes.isError ? <ErrorNotice error={mistakes.error} /> : null}
      {mistakes.data ? <MistakeList examId={examId} items={mistakes.data.items} /> : null}
    </main>
  );
}

function MistakeList({ examId, items }: { examId: string; items: TrainingMistake[] }) {
  const [skill, setSkill] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const skills = useMemo(() => mistakeSkills(items), [items]);
  const shown = filterMistakes(items, { skill, openOnly });

  if (items.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="لا توجد أخطاء لمراجعتها"
        description="كل سؤال تخطئ فيه أثناء التدريب يظهر هنا مع شرحه، لتعود إليه متى شئت."
      >
        <Link href={`/exams/${examId}/training`} className="btn">
          ابدأ التدريب <Icon name="arrow" />
        </Link>
      </EmptyState>
    );
  }

  const open = items.filter((item) => !item.correctedLater).length;
  return (
    <>
      <ul className="profile-summary" aria-label="ملخص الأخطاء">
        <li>
          <strong>{items.length}</strong>
          <span>للمراجعة</span>
        </li>
        <li>
          <strong>{open}</strong>
          <span>لم تُصحَّح بعد</span>
        </li>
        <li>
          <strong>{items.length - open}</strong>
          <span>أجبت عنها صحيحًا لاحقًا</span>
        </li>
      </ul>

      <fieldset className="mistake-filters">
        <legend className="visually-hidden">تصفية الأخطاء</legend>
        <div className="chip-group">
          <button
            type="button"
            className="chip"
            aria-pressed={skill === null}
            onClick={() => setSkill(null)}
          >
            كل المهارات
          </button>
          {skills.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={skill === name}
              onClick={() => setSkill(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
          />
          ما لم أصححه بعد فقط
        </label>
      </fieldset>

      {shown.length === 0 ? (
        <p className="notice" role="status">
          لا توجد أخطاء تطابق هذا الاختيار.
        </p>
      ) : (
        <ol className="mistake-list">
          {shown.map((item) => (
            <MistakeCard key={item.questionVersionId} item={item} />
          ))}
        </ol>
      )}
    </>
  );
}

function MistakeCard({ item }: { item: TrainingMistake }) {
  return (
    <li className="card mistake-card stack">
      <div className="mistake-card__meta">
        {item.skillName ? <span className="badge">{item.skillName}</span> : null}
        <span className="small muted">{formatDate(item.answeredAt)}</span>
        {item.correctedLater ? (
          <span className="mastery-badge mastery-badge--mastered">
            <Icon name="check" /> صحّحته لاحقًا
          </span>
        ) : null}
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
    </li>
  );
}
