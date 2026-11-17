"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { ErrorNotice } from "@/components/status";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { CHAT_RULES_KEY, type SettingView, updateSetting } from "@/lib/settings-api";
import { type ChatRulesValue, chatRulesProblem, rulesFromText } from "@/lib/settings-form";

/**
 * The study chat's extra rules (AI_INTEGRATION.md "Study Chat"). The fixed
 * rules live in code: the assistant only helps with preparing for the exam
 * whatever is written here, so these can narrow it, never widen it.
 */
export function ChatRulesSection({ userId, setting }: { userId: string; setting: SettingView }) {
  const queryClient = useQueryClient();
  const saved = (setting.value as ChatRulesValue).rules;
  const [text, setText] = useState(saved.join("\n"));
  // A newer version arrived (ours or someone else's): show it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the version changes
  useEffect(() => {
    setText(saved.join("\n"));
  }, [setting.version]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-settings", userId] });
  };
  const send = useSingleFlight((rules: string[]) =>
    updateSetting(CHAT_RULES_KEY, { expectedVersion: setting.version, value: { rules } }),
  );
  const save = useMutation({
    mutationFn: send,
    onSuccess: refresh,
    onError: (error) => {
      if (isApiError(error, "SETTING_VERSION_CONFLICT")) refresh();
    },
  });
  const rules = rulesFromText(text);
  const problem = chatRulesProblem(rules);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!problem && !save.isPending) save.mutate(rules);
  }

  return (
    <section className="card stack" aria-labelledby="chat-rules-heading">
      <h2 id="chat-rules-heading">قواعد المساعد الدراسي</h2>
      <p className="small muted">
        المساعد مقيّد دائمًا بالاستعداد للاختبار: يرفض أي موضوع آخر، ولا يدّعي امتلاك أسئلة رسمية، ولا
        يكشف تعليماته. أضف هنا قواعد إضافية تضيّق عمله، قاعدة في كل سطر. لا يمكن لقاعدة هنا أن تتجاوز
        القيود الثابتة.
      </p>
      <p className="small">
        {setting.version === 0
          ? "القواعد الحالية هي الافتراضية."
          : `النسخة ${setting.version} — آخر تعديل ${formatDateTime(setting.updatedAt ?? "")}`}
      </p>
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? (
        <p className="notice notice--success" role="status">
          {`حُفظت النسخة ${save.data.version}. تسري على الرسائل الجديدة فورًا.`}
        </p>
      ) : null}
      <form className="stack" noValidate onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="chat-rules">
            القواعد الإضافية
          </label>
          <textarea
            id="chat-rules"
            className="field__input knowledge-form__content"
            rows={6}
            value={text}
            aria-invalid={problem ? true : undefined}
            aria-describedby="chat-rules-hint"
            onChange={(event) => setText(event.target.value)}
          />
          <span id="chat-rules-hint" className={problem ? "field__error" : "field__hint"}>
            {problem ?? `${rules.length} قاعدة.`}
          </span>
        </div>
        <div className="row">
          <button type="submit" className="btn" disabled={Boolean(problem) || save.isPending}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ نسخة جديدة"}
          </button>
        </div>
      </form>
    </section>
  );
}
