"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { getSessionDecisions, type SessionDecisions } from "@/lib/admin-insights-api";
import { reasonLabel } from "@/lib/decision-labels";
import { SESSION_TITLES } from "@/lib/diagnostics";
import { percentText } from "@/lib/mastery-labels";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN_CANDIDATES = 5;
const SCORE_DIGITS = 2;

export default function AdminDecisionsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.auditView}>
      {(me) => (
        <Suspense fallback={<Loading />}>
          <Decisions userId={me.user.id} />
        </Suspense>
      )}
    </AdminGate>
  );
}

function Decisions({ userId }: { userId: string }) {
  const router = useRouter();
  const sessionId = useSearchParams().get("sessionId") ?? "";
  const [input, setInput] = useState(sessionId);
  const valid = UUID.test(sessionId);
  const decisions = useQuery({
    queryKey: ["admin-decisions", userId, sessionId],
    queryFn: () => getSessionDecisions(sessionId),
    enabled: valid,
  });
  const search = (event: FormEvent) => {
    event.preventDefault();
    router.replace(`/admin/adaptive-decisions?sessionId=${encodeURIComponent(input.trim())}`);
  };

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="قرارات التدريب"
        description="لماذا اختار المحرك كل سؤال في جلسة تدريب: المهارة المستهدفة، والإتقان والثقة وقتها، والصعوبة، والأسباب، والمرشحون."
      />
      <form className="admin-form audit-filter" onSubmit={search}>
        <div className="field">
          <label className="field__label" htmlFor="decision-session">
            رقم الجلسة
          </label>
          <input
            id="decision-session"
            className="field__input"
            dir="ltr"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <button type="submit" className="btn">
          عرض
        </button>
      </form>
      {sessionId && !valid ? <p className="notice">رقم الجلسة غير صالح.</p> : null}
      {decisions.isPending && valid ? <Loading /> : null}
      {decisions.isError ? <ErrorNotice error={decisions.error} /> : null}
      {decisions.data ? <DecisionList data={decisions.data} /> : null}
    </main>
  );
}

function DecisionList({ data }: { data: SessionDecisions }) {
  const type = data.session.type as keyof typeof SESSION_TITLES;
  return (
    <section className="card stack" aria-labelledby="decisions-heading">
      <h2 id="decisions-heading">{`${SESSION_TITLES[type] ?? data.session.type} · ${data.session.examName}`}</h2>
      {data.items.length === 0 ? (
        <p className="muted">لا قرارات تكيفية في هذه الجلسة (أسئلتها مخططة مسبقًا).</p>
      ) : (
        <ol className="list">
          {data.items.map((decision) => (
            <li key={decision.id} className="audit-entry">
              <div className="audit-entry__head">
                <strong>{`السؤال ${decision.itemOrdinal} — ${decision.targetSkill.name}`}</strong>
                <span className="small muted">{decision.answered ? "أُجيب" : "لم يُجب بعد"}</span>
              </div>
              <span className="small">
                {[
                  decision.masterySnapshot === null
                    ? "الإتقان: لم يُقس"
                    : `الإتقان ${percentText(decision.masterySnapshot)}`,
                  decision.confidenceSnapshot === null
                    ? null
                    : `الثقة ${percentText(decision.confidenceSnapshot)}`,
                  decision.targetDifficulty === null
                    ? null
                    : `الصعوبة المستهدفة ${decision.targetDifficulty}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <ul className="audit-entry__reasons">
                {decision.reasons.map((code) => (
                  <li key={code} className="small">
                    {reasonLabel(code)}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="small">المرشحون</summary>
                <ul className="small" dir="ltr">
                  {decision.candidates.slice(0, SHOWN_CANDIDATES).map((candidate) => (
                    <li key={candidate.questionVersionId}>
                      {`${candidate.questionVersionId === decision.selectedQuestionVersionId ? "✓ " : ""}${candidate.questionVersionId.slice(0, 8)} · d ${candidate.difficulty} · score ${candidate.score.toFixed(SCORE_DIGITS)}`}
                    </li>
                  ))}
                </ul>
              </details>
              <span className="small muted" dir="ltr">
                {`${decision.engineVersion} · ${decision.configVersion}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
