import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ExamProgress, getSkillProfile } from "@/lib/api";
import { MASTERY_STATE_LABELS, percentText } from "@/lib/mastery-labels";
import { improvementText, nextStepAction, nextStepLink, nextStepReason } from "@/lib/next-step";
import { Fold } from "./fold";
import { Icon } from "./icon";
import { SkillRow, StateWord } from "./skill-row";
import { StandingTiles } from "./skill-tiles";
import { ErrorNotice } from "./status";

/**
 * The student dashboard's blocks (UI_BRAND.md "Student Dashboard Principle"):
 * where the student stands, strengths, gaps, and one next action. Every
 * figure comes from /me/dashboard or the skill profile; nothing is derived
 * here beyond formatting.
 */

const GAPS_SHOWN = 5;

function useSkillProfile(examId: string, enabled = true) {
  return useQuery({
    queryKey: ["skill-profile", examId],
    queryFn: () => getSkillProfile(examId),
    enabled,
  });
}

/**
 * The one thing to do next, chosen by the API. Secondary routes sit under it
 * as quiet links, so the card never offers three buttons to the same place.
 */
export function NextStepCard({ progress }: { progress: ExamProgress }) {
  const { exam, standing } = progress;
  const next = nextStepLink(progress.nextStep, exam.id);
  return (
    <section className="next-card" aria-labelledby="next-step-title">
      <p className="next-card__label">خطوتك التالية</p>
      <h2 id="next-step-title">{next.label}</h2>
      <p className="next-card__why">{nextStepReason(progress.nextStep)}</p>
      <div className="next-card__actions">
        <Link href={next.href} className="btn btn--light btn--large btn--block">
          {nextStepAction(progress.nextStep)} <Icon name="arrow" />
        </Link>
        <div className="next-card__links">
          {standing ? (
            <>
              <Link href={`/exams/${exam.id}/mistakes`}>مراجعة أخطائي</Link>
              <Link href={`/exams/${exam.id}/mock-exam`}>اختبار محاكٍ</Link>
            </>
          ) : (
            <Link href="/subscriptions">الباقات</Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** The first visit: no exam yet, so the only step is the free diagnostic. */
export function StartPanel({ diagnosticHref }: { diagnosticHref: string }) {
  return (
    <section className="next-card next-card--wide" aria-labelledby="next-step-title">
      <div>
        <p className="next-card__label">خطوتك الأولى</p>
        <h2 id="next-step-title">ابدأ التشخيص المصغّر المجاني</h2>
        <p className="next-card__why">
          أسئلة قليلة من أقسام الاختبار تعطيك قراءة أولى لمستواك، وتظهر نتيجتها فور إكمالها.
        </p>
      </div>
      <Link href={diagnosticHref} className="btn btn--light btn--large">
        ابدأ التشخيص <Icon name="arrow" />
      </Link>
    </section>
  );
}

export function ExamTabs({
  exams,
  selectedId,
  onSelect,
}: {
  exams: ExamProgress[];
  selectedId: string;
  onSelect: (examId: string) => void;
}) {
  if (exams.length < 2) return null;
  return (
    <fieldset className="exam-tabs">
      <legend className="visually-hidden">اختر الاختبار المعروض</legend>
      {exams.map(({ exam }) => (
        <button
          key={exam.id}
          type="button"
          aria-pressed={exam.id === selectedId}
          className="exam-tabs__tab"
          onClick={() => onSelect(exam.id)}
        >
          {exam.nameAr}
        </button>
      ))}
    </fieldset>
  );
}

/** Where the student stands: every skill as one tile, split by domain. */
export function StandingPanel({ progress }: { progress: ExamProgress }) {
  const profile = useSkillProfile(progress.exam.id, progress.standing !== null);
  if (!progress.standing) return null;
  return (
    <section className="panel" aria-labelledby="standing-title">
      <h2 id="standing-title" className="panel__label">
        أين أنت الآن
      </h2>
      <StandingTiles summary={progress.standing.summary} domains={profile.data?.domains} />
    </section>
  );
}

/** The gaps the engine ranked, most urgent first, each with its measured level. */
export function GapsPanel({ progress }: { progress: ExamProgress }) {
  const examId = progress.exam.id;
  const profile = useSkillProfile(examId, progress.standing !== null);
  if (!progress.standing) return null;
  const skills = new Map(
    (profile.data?.domains ?? []).flatMap((domain) =>
      domain.skills.map((skill) => [skill.name, skill] as const),
    ),
  );
  const gaps = (profile.data?.gaps ?? progress.standing.gaps).slice(0, GAPS_SHOWN);
  return (
    <section className="panel" aria-labelledby="gaps-title">
      <div className="panel__head">
        <h2 id="gaps-title">أين تخسر درجات</h2>
        <Link href={`/exams/${examId}/profile`} className="text-link">
          كل المهارات <Icon name="chevron" />
        </Link>
      </div>
      {profile.isError ? <ErrorNotice error={profile.error} /> : null}
      {gaps.length ? (
        <ol className="skill-rows">
          {gaps.map((gap, index) => {
            const skill = skills.get(gap.skillName);
            return (
              <SkillRow
                key={gap.skillName}
                rank={index + 1}
                name={gap.skillName}
                state={<StateWord tone="gap">فجوة</StateWord>}
                meta={skill ? `${skill.evidenceCount} إجابة مقيسة` : undefined}
                share={skill?.mastery}
                figure={skill?.mastery == null ? undefined : percentText(skill.mastery)}
              />
            );
          })}
        </ol>
      ) : (
        <p className="panel__empty">لا فجوات مقيسة الآن. تابع التدريب لتبقى كذلك.</p>
      )}
    </section>
  );
}

/** Proven strengths carry the gold fold; ready skills wait for their reassessment. */
export function StrengthsPanel({ progress }: { progress: ExamProgress }) {
  const { standing } = progress;
  if (!standing) return null;
  const mastered = standing.strengths.filter((entry) => entry.state === "MASTERED");
  const others = standing.strengths.filter((entry) => entry.state !== "MASTERED");
  return (
    <section className="panel" aria-labelledby="strengths-title">
      <div className="panel__head">
        <h2 id="strengths-title">نقاط قوتك</h2>
      </div>
      {standing.strengths.length ? (
        <ul className="skill-rows">
          {mastered.map((entry) => (
            <SkillRow
              key={entry.skillName}
              name={entry.skillName}
              state={
                <>
                  <Fold />
                  <StateWord tone="earned">{MASTERY_STATE_LABELS.MASTERED}</StateWord>
                </>
              }
              figure={percentText(entry.mastery)}
            />
          ))}
          {others.map((entry) => (
            <SkillRow
              key={entry.skillName}
              name={entry.skillName}
              state={
                entry.state === "READY_FOR_REASSESSMENT" ? (
                  <StateWord tone="ready">جاهزة لإعادة القياس</StateWord>
                ) : undefined
              }
              figure={percentText(entry.mastery)}
            />
          ))}
        </ul>
      ) : (
        <p className="panel__empty">
          لا مهارة تجاوزت حد القوة بعد. تظهر هنا حين ترتفع نسبتك في مهارة وتثبت.
        </p>
      )}
      {standing.improvements.length ? (
        <>
          <h3 className="panel__sub">تقدّمك هذا الأسبوع</h3>
          <ul className="skill-rows">
            {standing.improvements.map((change) => (
              <SkillRow
                key={change.nodeName}
                name={change.nodeName}
                meta={`${percentText(change.before)} ← ${percentText(change.after)}`}
                figure={improvementText(change.before, change.after)}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
