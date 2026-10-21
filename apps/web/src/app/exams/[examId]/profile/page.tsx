"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CSSProperties } from "react";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import {
  getFullReassessmentStatus,
  getSkillProfile,
  isApiError,
  type ProfileNode,
  type SkillProfile,
} from "@/lib/api";
import { waitingLines } from "@/lib/full-reassessment";
import { answersText, coverageText, MASTERY_STATE_LABELS, percentText } from "@/lib/mastery-labels";
import { useRequireUser } from "@/lib/session";

/** The student's skill profile for a paid exam (PRD §6). Every figure is the API's. */
export default function SkillProfilePage() {
  const { examId } = useParams<{ examId: string }>();
  const user = useRequireUser();
  const profile = useQuery({
    queryKey: ["skill-profile", user?.id, examId],
    queryFn: () => getSkillProfile(examId),
    enabled: user !== null,
    retry: false,
  });

  if (profile.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (isApiError(profile.error, "SKILL_PROFILE_REQUIRES_ACCESS")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="lock"
          title="ملف المهارات ضمن الباقة"
          description="بعد الاشتراك في هذا الاختبار ترى كل مهاراتك، ومستوى كل منها، والفجوات مرتبة حسب أولويتها."
        >
          <Link href="/subscriptions" className="btn">
            عرض الباقات
          </Link>
        </EmptyState>
      </main>
    );
  }
  if (profile.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={profile.error}>
          <Link href="/exams" className="btn btn--small">
            الاختبارات
          </Link>
        </ErrorNotice>
      </main>
    );
  }
  return <Profile profile={profile.data} />;
}

function Profile({ profile }: { profile: SkillProfile }) {
  const { summary } = profile;
  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title={`ملف مهاراتي — ${profile.exam.nameAr}`}
        description="مستواك في كل مهارة يُحدَّث بعد كل إجابة. الفجوات مرتبة من الأحوج إلى التدريب."
        action={
          <Link href={`/exams/${profile.exam.id}/full-diagnostic`} className="text-link">
            التشخيص الكامل <Icon name="chevron" />
          </Link>
        }
      />

      <ul className="profile-summary" aria-label="ملخص">
        <li>
          <strong>{`${summary.assessed} / ${summary.skills}`}</strong>
          <span>مهارات قيست</span>
        </li>
        <li>
          <strong>{summary.gaps}</strong>
          <span>فجوات</span>
        </li>
        <li>
          <strong>{summary.readyForReassessment}</strong>
          <span>جاهزة لإعادة القياس</span>
        </li>
        <li>
          <strong>{summary.mastered}</strong>
          <span>متقنة</span>
        </li>
      </ul>

      {summary.assessed === 0 ? (
        <EmptyState
          title="لم نقِس مهاراتك بعد"
          description="ابدأ التشخيص الكامل ليظهر مستواك في كل مهارة."
        >
          <Link href={`/exams/${profile.exam.id}/full-diagnostic`} className="btn btn--small">
            ابدأ التشخيص الكامل
          </Link>
        </EmptyState>
      ) : null}

      {summary.assessed > 0 ? (
        <p>
          <Link href={`/exams/${profile.exam.id}/training`} className="btn">
            {profile.gaps.length > 0 ? "تدرّب على فجواتك" : "ابدأ التدريب"} <Icon name="arrow" />
          </Link>
        </p>
      ) : null}

      {summary.assessed > 0 ? <ReDiagnosticCard examId={profile.exam.id} /> : null}

      {profile.gaps.length > 0 ? (
        <section className="card stack" aria-labelledby="gaps-heading">
          <h2 id="gaps-heading">الفجوات حسب الأولوية</h2>
          <ol className="list">
            {profile.gaps.map((gap) => (
              <li key={gap.skillId} className="list__item list__item--weakness">
                <span>
                  <strong>{gap.skillName}</strong>
                  <span className="small muted">{` · ${gap.domainName}`}</span>
                </span>
                <span className="small">{MASTERY_STATE_LABELS[gap.state]}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {profile.domains.map((domain) => (
        <section key={domain.id} className="card stack" aria-labelledby={`domain-${domain.id}`}>
          <h2 id={`domain-${domain.id}`}>{domain.name}</h2>
          <ul className="profile-skills">
            {domain.skills.map((skill) => (
              <li key={skill.id} className="profile-skill">
                <NodeRow node={skill} />
                {skill.state === "READY_FOR_REASSESSMENT" ? (
                  <Link
                    href={`/exams/${profile.exam.id}/skills/${skill.id}/reassessment`}
                    className="btn btn--small profile-skill__action"
                  >
                    أعد قياس المهارة
                  </Link>
                ) : null}
                {skill.reassessment ? (
                  <p className="small muted">
                    {`لم تكتمل إعادة القياس الأخيرة. باقي ${answersText(skill.reassessment.remainingAttempts)} في التدريب قبل المحاولة التالية.`}
                  </p>
                ) : null}
                {skill.subskills.length > 0 ? (
                  <ul className="profile-subskills">
                    {skill.subskills.map((subskill) => (
                      <li key={subskill.id}>
                        <NodeRow node={subskill} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Link href="/exams" className="text-link">
        الاختبارات <Icon name="arrow" />
      </Link>
    </main>
  );
}

function NodeRow({ node }: { node: ProfileNode }) {
  return (
    <div className="profile-node">
      <div className="profile-node__head">
        <strong>{node.name}</strong>
        <span className={`mastery-badge mastery-badge--${node.state.toLowerCase()}`}>
          {MASTERY_STATE_LABELS[node.state]}
        </span>
      </div>
      {node.mastery === null ? null : (
        <div className="profile-node__bar">
          <span className="profile-bar" aria-hidden="true">
            <span style={{ "--share": node.mastery } as CSSProperties} />
          </span>
          <span className="small">{`تقدير الإتقان ${percentText(node.mastery)}`}</span>
        </div>
      )}
      <span className="small muted">{coverageText(node.coverage)}</span>
    </div>
  );
}

/** Where the student stands with the full re-diagnostic (PRD §8); hidden until it applies. */
function ReDiagnosticCard({ examId }: { examId: string }) {
  const user = useRequireUser();
  const status = useQuery({
    queryKey: ["full-reassessment-status", user?.id, examId],
    queryFn: () => getFullReassessmentStatus(examId),
    enabled: user !== null,
  });
  const state = status.data?.state;
  if (!status.data || (state !== "ELIGIBLE" && state !== "WAITING" && state !== "OPEN")) {
    return null;
  }
  const href = `/exams/${examId}/full-reassessment`;
  return (
    <section className="card stack" aria-labelledby="rediagnostic-heading">
      <h2 id="rediagnostic-heading">إعادة التشخيص الشامل</h2>
      {state === "WAITING" ? (
        <ul className="stack small">
          {waitingLines(status.data, new Date()).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="small">
          {state === "OPEN"
            ? "بدأت إعادة التشخيص ولم تكملها بعد."
            : "متاحة الآن: قِس الاختبار كله من جديد وقارن بقياسك السابق."}
        </p>
      )}
      <Link href={href} className={state === "WAITING" ? "text-link" : "btn btn--small"}>
        {state === "OPEN"
          ? "أكمل إعادة التشخيص"
          : state === "ELIGIBLE"
            ? "ابدأ إعادة التشخيص"
            : "التفاصيل"}
      </Link>
    </section>
  );
}
