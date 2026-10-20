"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  getAiStatus,
  type MetadataSuggestion,
  requestExplanationDraft,
  requestMetadataSuggestion,
} from "@/lib/ai-api";
import { aiErrorMessage, difficultyLabel } from "@/lib/ai-assist";
import { ErrorNotice } from "../../status";

/** How long the AI status stays fresh: it changes only with a deployment. */
const STATUS_STALE_MS = 5 * 60_000;

type AiAssistPanelProps = {
  versionId: string;
  userId: string;
  /** The form has edits the suggestions do not see yet. */
  unsaved: boolean;
  onApplySuggestion: (suggestion: MetadataSuggestion) => void;
  onApplyExplanation: (explanation: string) => void;
};

function AiError({ error }: { error: unknown }) {
  const message = aiErrorMessage(error);
  if (!message) return <ErrorNotice error={error} />;
  return (
    <p className="notice notice--error" role="alert">
      {message}
    </p>
  );
}

/**
 * AI assistance in the draft editor (C3, AI_INTEGRATION.md). Hidden when AI
 * is off. Suggestions come from the last saved version; applying one only
 * fills the form, and the author still saves and sends it for review.
 */
export function AiAssistPanel(props: AiAssistPanelProps) {
  const { versionId, userId, unsaved, onApplySuggestion, onApplyExplanation } = props;
  const status = useQuery({
    queryKey: ["ai-status", userId],
    queryFn: getAiStatus,
    staleTime: STATUS_STALE_MS,
  });
  const [applied, setApplied] = useState<"suggestion" | "explanation" | null>(null);
  const suggest = useMutation({
    mutationFn: () => requestMetadataSuggestion(versionId),
    onMutate: () => setApplied(null),
  });
  const explain = useMutation({
    mutationFn: () => requestExplanationDraft(versionId),
    onMutate: () => setApplied(null),
  });

  if (!status.data?.enabled) return null;
  const suggestion = suggest.data?.suggestion;
  const draft = explain.data?.draft;

  return (
    <section className="stack ai-assist" aria-labelledby="qe-ai">
      <h3 id="qe-ai">مساعدة الذكاء الاصطناعي</h3>
      <p className="small muted">
        اقتراحات تُبنى على آخر نسخة محفوظة من السؤال. التطبيق يملأ النموذج فقط؛ راجع النص ثم احفظ،
        وتمرّ النسخة بالمراجعة كالمعتاد.
      </p>
      {status.data.provider === "fake" ? (
        <p className="small muted">
          يعمل الآن مزوّد اختبار، فالاقتراحات ثابتة وليست من نموذج حقيقي.
        </p>
      ) : null}
      {unsaved ? (
        <p className="notice" role="status">
          لديك تغييرات غير محفوظة لن تراها المساعدة. احفظ أولًا ليُبنى الاقتراح عليها.
        </p>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={suggest.isPending}
          onClick={() => suggest.mutate()}
        >
          {suggest.isPending ? "جارٍ الاقتراح…" : "اقترح المهارة والصعوبة"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={explain.isPending}
          onClick={() => explain.mutate()}
        >
          {explain.isPending ? "جارٍ الصياغة…" : "اقترح شرحًا"}
        </button>
      </div>

      {suggest.isError ? <AiError error={suggest.error} /> : null}
      {suggestion ? (
        <div className="ai-assist__result stack" aria-live="polite">
          <p>
            <strong>المهارة الأساسية:</strong> {suggestion.nodeName}
            <br />
            <strong>الصعوبة:</strong> {difficultyLabel(suggestion.difficulty)}
          </p>
          <p className="small">{suggestion.rationale}</p>
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                onApplySuggestion(suggestion);
                setApplied("suggestion");
              }}
            >
              تطبيق على النموذج
            </button>
            <span className="small muted">تصبح المهارة المقترحة الربط الأساسي بدل الحالي.</span>
          </div>
        </div>
      ) : null}

      {explain.isError ? <AiError error={explain.error} /> : null}
      {draft ? (
        <div className="ai-assist__result stack" aria-live="polite">
          <p className="ai-assist__draft">{draft.explanation}</p>
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                onApplyExplanation(draft.explanation);
                setApplied("explanation");
              }}
            >
              وضعه في حقل الشرح
            </button>
            <span className="small muted">يستبدل الشرح الحالي في النموذج.</span>
          </div>
        </div>
      ) : null}

      {applied && unsaved ? (
        <p className="small" role="status">
          {applied === "suggestion"
            ? "طُبّق الاقتراح على النموذج. راجعه ثم احفظ."
            : "وُضع الشرح في حقله. راجعه ثم احفظ."}
        </p>
      ) : null}
    </section>
  );
}
