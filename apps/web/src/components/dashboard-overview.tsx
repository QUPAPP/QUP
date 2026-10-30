import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { type ExamProgress, getSkillProfile } from "@/lib/api";
import { coverageShare } from "@/lib/dashboard-view";
import { MASTERY_STATE_LABELS, percentText } from "@/lib/mastery-labels";
import { improvementText, nextStepLink } from "@/lib/next-step";
import { Icon, type IconName } from "./icon";
import { ErrorNotice, Loading } from "./status";

/**
 * The student dashboard's blocks (UI_BRAND.md "Student Dashboard Principle"):
 * where the student stands, strengths, gaps, and one next action. Every
 * figure comes from /me/dashboard or the skill profile; nothing is derived
 * here beyond formatting.
 */

export function DashboardBanner({ progress }: { progress: ExamProgress | undefined }) {
  const next = progress ? nextStepLink(progress.nextStep, progress.exam.id) : null;
  return (
    <section className="dash-banner" aria-labelledby="dash-banner-title">
      <Image
        src="/brand/qup-mountain-journey.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 900px) 100vw, 60vw"
        className="dash-banner__photo"
      />
      <div className="dash-banner__shade" aria-hidden="true" />
      <div className="dash-banner__copy">
        <h1 id="dash-banner-title">
          تطوير مستواك يبدأ بفهم
          <span>نقاط ضعفك ومعالجتها.</span>
        </h1>
        <p>مع QUP، لست مجرد رقم في اختبار؛ نعرف معك أين تقف، ونختار خطوتك التالية.</p>
        {next ? (
          <Link href={next.href} className="btn btn--gold">
            {next.label} <Icon name="arrow" />
          </Link>
        ) : (
          <Link href="/exams" className="btn btn--gold">
            اختر اختبارك <Icon name="arrow" />
          </Link>
        )}
      </div>
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

/** Coverage ring and the exam's next step. */
export function StandingCard({ progress }: { progress: ExamProgress }) {
  const { exam, standing } = progress;
  const next = nextStepLink(progress.nextStep, exam.id);
  if (!standing) {
    return (
      <section className="dash-card standing standing--locked" aria-labelledby="standing-title">
        <p className="eyebrow">{exam.nameAr}</p>
        <h2 id="standing-title">ملف مهاراتك ينتظرك</h2>
        <p className="muted small">
          التشخيص المصغّر مجاني. ملف المهارات الكامل والتدريب وإعادة القياس ضمن باقة هذا الاختبار.
        </p>
        <div className="standing__actions">
          <Link href={next.href} className="btn">
            {next.label} <Icon name="arrow" />
          </Link>
          <Link href="/subscriptions" className="text-link">
            الباقات <Icon name="chevron" />
          </Link>
        </div>
      </section>
    );
  }
  const share = coverageShare(standing.summary);
  return (
    <section className="dash-card standing" aria-labelledby="standing-title">
      <div className="score-ring" style={{ "--share": share } as CSSProperties}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="score-ring__track" cx="60" cy="60" r="52" pathLength="100" />
          <circle className="score-ring__value" cx="60" cy="60" r="52" pathLength="100" />
        </svg>
        <div className="score-ring__label">
          <strong>
            <bdi>{percentText(share)}</bdi>
          </strong>
          <span>من المهارات بدأ قياسها</span>
        </div>
      </div>
      <div className="standing__body">
        <p className="eyebrow">{exam.nameAr}</p>
        <h2 id="standing-title">أين أنت الآن</h2>
        <p className="muted small">
          {`بدأنا قياس ${standing.summary.assessed} من ${standing.summary.skills} مهارات، وأتقنت منها ${standing.summary.mastered}. كل إجابة تزيد دقة القياس.`}
        </p>
        <div className="row">
          <Link href={next.href} className="btn btn--small">
            {next.label} <Icon name="arrow" />
          </Link>
          <Link href={`/exams/${exam.id}/mistakes`} className="text-link">
            مراجعة أخطائي <Icon name="chevron" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function StandingMetrics({ progress }: { progress: ExamProgress }) {
  const { standing } = progress;
  if (!standing) return null;
  const topGap = standing.gaps[0];
  const topStrength = standing.strengths[0];
  const metrics: { label: string; value: string; icon: IconName; tone?: string }[] = [
    {
      label: "مهارات قيست",
      value: `${standing.summary.assessed} / ${standing.summary.skills}`,
      icon: "layers",
    },
    { label: "متقنة", value: String(standing.summary.mastered), icon: "shield", tone: "success" },
    {
      label: "جاهزة لإعادة القياس",
      value: String(standing.summary.readyForReassessment),
      icon: "flag",
    },
    { label: "فجوات", value: String(standing.summary.gaps), icon: "target", tone: "danger" },
    {
      label: topStrength ? "أعلى مهارة لديك" : "أعلى مهارة",
      value: topStrength?.skillName ?? "—",
      icon: "trend",
      tone: "success",
    },
    {
      label: "أكبر فجوة",
      value: topGap?.skillName ?? "—",
      icon: "target",
      tone: "danger",
    },
  ];
  return (
    <dl className="metric-strip" aria-label="ملخص مهاراتك">
      {metrics.map((metric) => (
        <div key={metric.label} className="metric" data-tone={metric.tone}>
          <span className="metric__icon">
            <Icon name={metric.icon} />
          </span>
          <dt>{metric.label}</dt>
          <dd>
            <bdi>{metric.value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Each domain's skills with their measured mastery, from the skill profile. */
export function SkillMap({ examId }: { examId: string }) {
  const profile = useQuery({
    queryKey: ["skill-profile", examId],
    queryFn: () => getSkillProfile(examId),
  });
  return (
    <section className="dash-card skill-map" aria-labelledby="skill-map-title">
      <div className="dash-card__head">
        <h2 id="skill-map-title">
          <Icon name="chart" />
          خريطة مهاراتك
        </h2>
        <Link href={`/exams/${examId}/profile`} className="text-link">
          الملف الكامل <Icon name="chevron" />
        </Link>
      </div>
      {profile.isPending ? <Loading /> : null}
      {profile.isError ? <ErrorNotice error={profile.error} /> : null}
      {profile.data ? (
        <div className="skill-map__domains">
          {profile.data.domains.map((domain) => (
            <section key={domain.id} className="skill-domain" aria-label={domain.name}>
              <h3>{domain.name}</h3>
              <ul>
                {domain.skills.map((skill) => (
                  <li key={skill.id}>
                    <div className="skill-domain__row">
                      <span>{skill.name}</span>
                      <bdi>{skill.mastery === null ? "—" : percentText(skill.mastery)}</bdi>
                    </div>
                    <span className="profile-bar" aria-hidden="true">
                      <span style={{ "--share": skill.mastery ?? 0 } as CSSProperties} />
                    </span>
                    <span className={`mastery-badge mastery-badge--${skill.state.toLowerCase()}`}>
                      {MASTERY_STATE_LABELS[skill.state]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function FocusPanels({ progress }: { progress: ExamProgress }) {
  const { standing } = progress;
  if (!standing) return null;
  return (
    <div className="focus-panels">
      <section className="dash-card" aria-labelledby="gaps-title">
        <h2 id="gaps-title" className="dash-card__title">
          <Icon name="target" />
          أولوياتك في التدريب
        </h2>
        {standing.gaps.length ? (
          <ol className="rank-list rank-list--gaps">
            {standing.gaps.map((gap, index) => (
              <li key={gap.skillName}>
                <span className="rank-list__index">{index + 1}</span>
                <span>{gap.skillName}</span>
                <span className="mastery-badge mastery-badge--gap">{MASTERY_STATE_LABELS.GAP}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small muted">لا فجوات مقيسة الآن.</p>
        )}
      </section>
      <section className="dash-card" aria-labelledby="strengths-title">
        <h2 id="strengths-title" className="dash-card__title">
          <Icon name="shield" />
          نقاط قوتك
        </h2>
        {standing.strengths.length ? (
          <ul className="rank-list">
            {standing.strengths.map((strength) => (
              <li key={strength.skillName}>
                <Icon name="check" />
                <span>{strength.skillName}</span>
                <bdi className="small">
                  {strength.state === "MASTERED"
                    ? MASTERY_STATE_LABELS.MASTERED
                    : percentText(strength.mastery)}
                </bdi>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">تظهر بعد أن نقيس مهاراتك أكثر.</p>
        )}
      </section>
      {standing.improvements.length ? (
        <section className="dash-card" aria-labelledby="improvements-title">
          <h2 id="improvements-title" className="dash-card__title">
            <Icon name="trend" />
            تقدّمك هذا الأسبوع
          </h2>
          <ul className="rank-list">
            {standing.improvements.map((change) => (
              <li key={change.nodeName}>
                <span>{change.nodeName}</span>
                <bdi className="small rank-list__gain">
                  {improvementText(change.before, change.after)}
                </bdi>
                <bdi className="small muted">
                  {`${percentText(change.before)} ← ${percentText(change.after)}`}
                </bdi>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
