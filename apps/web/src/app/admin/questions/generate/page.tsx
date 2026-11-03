"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { TaxonomyPicker } from "@/components/admin/question-editor/taxonomy-picker";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { type DraftDifficulty, getAiStatus, requestQuestionDraft } from "@/lib/ai-api";
import { aiErrorMessage } from "@/lib/ai-assist";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { getTaxonomyOutline, listAuthoringTaxonomies } from "@/lib/question-api";

const DIFFICULTIES: { value: DraftDifficulty; label: string }[] = [
  { value: "EASY", label: "سهل" },
  { value: "MEDIUM", label: "متوسط" },
  { value: "HARD", label: "صعب" },
];
const INSTRUCTIONS_MAX = 500;

export default function GenerateQuestionPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => <Generator userId={me.user.id} />}
    </AdminGate>
  );
}

/**
 * AI question drafting (AI_INTEGRATION.md "Question Generation"): the author
 * picks a skill and a difficulty, and the draft opens in the editor for
 * review like any question they wrote by hand.
 */
function Generator({ userId }: { userId: string }) {
  const id = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [taxonomyVersionId, setTaxonomyVersionId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [difficulty, setDifficulty] = useState<DraftDifficulty>("MEDIUM");
  const [instructions, setInstructions] = useState("");

  const status = useQuery({ queryKey: ["ai-status", userId], queryFn: getAiStatus });
  const taxonomies = useQuery({
    queryKey: ["authoring-taxonomies", userId],
    queryFn: listAuthoringTaxonomies,
  });
  const outline = useQuery({
    queryKey: ["taxonomy-outline", userId, taxonomyVersionId],
    queryFn: () => getTaxonomyOutline(taxonomyVersionId),
    enabled: taxonomyVersionId !== "",
  });
  const generate = useMutation({
    mutationFn: () =>
      requestQuestionDraft({
        taxonomyVersionId,
        nodeId,
        difficulty,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      }),
    onSuccess: async ({ question }) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-questions", userId] });
      router.push(`/admin/question-versions/${question.versionId}`);
    },
  });

  if (status.isPending || taxonomies.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (status.data && !status.data.tasks.includes("draft_question")) {
    return (
      <main id="main-content" className="page">
        <EmptyState
          icon="spark"
          title="توليد الأسئلة غير مفعّل"
          description="يحتاج هذا إلى تشغيل مزوّد الذكاء الاصطناعي في إعدادات الخادم (AI_PROVIDER)."
        >
          <Link href="/admin/questions/new" className="btn">
            اكتب سؤالًا يدويًا
          </Link>
        </EmptyState>
      </main>
    );
  }

  const nodes =
    outline.data?.domains.flatMap((domain) =>
      domain.skills.map((skill) => ({ domain: domain.name, skill })),
    ) ?? [];
  const ready = taxonomyVersionId !== "" && nodeId !== "";

  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href="/admin/questions" className="text-link text-link--back">
        بنك الأسئلة <Icon name="arrow" />
      </Link>
      <PageHeading
        title="توليد سؤال بالذكاء الاصطناعي"
        description="اختر المهارة والصعوبة، ويُكتب سؤال أصلي بأربعة خيارات وشرح. يُحفظ مسودة باسمك، فراجعه وعدّله ثم أرسله للمراجعة كأي سؤال."
      />
      <form
        className="card stack"
        aria-labelledby={`${id}-heading`}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !generate.isPending) generate.mutate();
        }}
      >
        <h2 id={`${id}-heading`}>المهارة</h2>
        {taxonomies.isError ? <ErrorNotice error={taxonomies.error} /> : null}
        <TaxonomyPicker
          exams={taxonomies.data?.items ?? []}
          value={taxonomyVersionId}
          onChange={(next) => {
            setTaxonomyVersionId(next);
            setNodeId("");
          }}
        />
        <div className="admin-form">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-node`}>
              المهارة أو المهارة الفرعية
            </label>
            <select
              id={`${id}-node`}
              className="field__input"
              value={nodeId}
              disabled={taxonomyVersionId === "" || outline.isPending}
              onChange={(event) => setNodeId(event.target.value)}
            >
              <option value="">اختر المهارة…</option>
              {nodes.map(({ domain, skill }) => (
                <optgroup key={skill.id} label={`${domain} — ${skill.name}`}>
                  <option value={skill.id}>{skill.name}</option>
                  {skill.subskills.map((subskill) => (
                    <option key={subskill.id} value={subskill.id}>
                      {skill.name} › {subskill.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <fieldset className="field">
            <legend className="field__label">الصعوبة</legend>
            <div className="chip-group">
              {DIFFICULTIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="chip"
                  aria-pressed={difficulty === option.value}
                  onClick={() => setDifficulty(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-notes`}>
            توجيه اختياري
          </label>
          <textarea
            id={`${id}-notes`}
            className="field__input"
            rows={3}
            maxLength={INSTRUCTIONS_MAX}
            placeholder="مثال: سؤال عن النسبة المئوية في سياق تسوّق"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <p className="field__hint">موضوع أو سياق تريده. لا يغيّر قواعد السؤال أو شكله.</p>
        </div>
        {generate.isError ? (
          aiErrorMessage(generate.error) ? (
            <p className="notice notice--error" role="alert">
              {aiErrorMessage(generate.error)}
            </p>
          ) : (
            <ErrorNotice error={generate.error} />
          )
        ) : null}
        <div className="row">
          <button type="submit" className="btn" disabled={!ready || generate.isPending}>
            <Icon name="spark" />
            {generate.isPending ? "جارٍ كتابة السؤال…" : "ولّد المسودة"}
          </button>
          <p className="small muted">قد يستغرق ذلك حتى نصف دقيقة.</p>
        </div>
      </form>
    </main>
  );
}
