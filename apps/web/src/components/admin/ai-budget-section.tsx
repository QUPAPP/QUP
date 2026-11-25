"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { ErrorNotice } from "@/components/status";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { AI_BUDGET_KEY, type SettingView, updateSetting } from "@/lib/settings-api";
import { type AiBudgetValue, budgetLimitProblem, parseBudgetLimit } from "@/lib/settings-form";

/**
 * The platform-wide AI ceiling (setting ai.dailyBudget): what every AI task
 * together may use in any 24 hours. Per-student limits bound one person; this
 * bounds a burst of accounts. An empty field is no limit.
 */
export function AiBudgetSection({ userId, setting }: { userId: string; setting: SettingView }) {
  const queryClient = useQueryClient();
  const saved = setting.value as AiBudgetValue;
  const [runs, setRuns] = useState(saved.maxRuns?.toString() ?? "");
  const [tokens, setTokens] = useState(saved.maxTokens?.toString() ?? "");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the version changes
  useEffect(() => {
    setRuns(saved.maxRuns?.toString() ?? "");
    setTokens(saved.maxTokens?.toString() ?? "");
  }, [setting.version]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-settings", userId] });
  };
  const send = useSingleFlight((value: AiBudgetValue) =>
    updateSetting(AI_BUDGET_KEY, { expectedVersion: setting.version, value }),
  );
  const save = useMutation({
    mutationFn: send,
    onSuccess: refresh,
    onError: (error) => {
      if (isApiError(error, "SETTING_VERSION_CONFLICT")) refresh();
    },
  });
  const runsProblem = budgetLimitProblem(runs);
  const tokensProblem = budgetLimitProblem(tokens);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (runsProblem || tokensProblem || save.isPending) return;
    save.mutate({ maxRuns: parseBudgetLimit(runs), maxTokens: parseBudgetLimit(tokens) });
  }

  return (
    <section className="card stack" aria-labelledby="ai-budget-heading">
      <h2 id="ai-budget-heading">سقف استخدام الذكاء الاصطناعي</h2>
      <p className="small muted">
        أقصى ما تستهلكه المنصة كلها من الذكاء الاصطناعي خلال آخر 24 ساعة (المساعد الدراسي، شرح
        الأخطاء، وتوليد الأسئلة). عند بلوغه يتوقف الذكاء الاصطناعي مؤقتًا للجميع حتى ينخفض الاستهلاك،
        وتبقى بقية المنصة تعمل. اترك الحقل فارغًا لعدم وضع حد. الاستهلاك الحالي في صفحة «الذكاء
        الاصطناعي».
      </p>
      <p className="small">
        {setting.version === 0
          ? "القيمة الحالية هي الافتراضية: بلا حد."
          : `النسخة ${setting.version} — آخر تعديل ${formatDateTime(setting.updatedAt ?? "")}`}
      </p>
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? (
        <p className="notice notice--success" role="status">
          {`حُفظت النسخة ${save.data.version}. تسري فورًا.`}
        </p>
      ) : null}
      <form className="admin-form" noValidate onSubmit={submit}>
        <BudgetField
          id="ai-budget-runs"
          label="أقصى عدد طلبات خلال 24 ساعة"
          value={runs}
          problem={runsProblem}
          onChange={setRuns}
        />
        <BudgetField
          id="ai-budget-tokens"
          label="أقصى عدد tokens خلال 24 ساعة (مدخلات ومخرجات)"
          value={tokens}
          problem={tokensProblem}
          onChange={setTokens}
        />
        <button
          type="submit"
          className="btn"
          disabled={Boolean(runsProblem || tokensProblem) || save.isPending}
        >
          {save.isPending ? "جارٍ الحفظ…" : "حفظ نسخة جديدة"}
        </button>
      </form>
    </section>
  );
}

function BudgetField(props: {
  id: string;
  label: string;
  value: string;
  problem: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        className="field__input"
        dir="ltr"
        inputMode="numeric"
        placeholder="بلا حد"
        value={props.value}
        aria-invalid={props.problem ? true : undefined}
        aria-describedby={props.problem ? `${props.id}-error` : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.problem ? (
        <span id={`${props.id}-error`} className="field__error" role="alert">
          {props.problem}
        </span>
      ) : null}
    </div>
  );
}
