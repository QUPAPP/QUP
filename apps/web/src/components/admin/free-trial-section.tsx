"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { ErrorNotice } from "@/components/status";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { FREE_TRIAL_KEY, type SettingView, updateSetting } from "@/lib/settings-api";
import { type FreeTrialValue, freeTrialProblem } from "@/lib/settings-form";

/**
 * The free taste of the study chat before subscribing (OPEN_QUESTIONS.md
 * #18): a number of replies per account, once. 0 keeps the chat for
 * subscribers only.
 */
export function FreeTrialSection({ userId, setting }: { userId: string; setting: SettingView }) {
  const queryClient = useQueryClient();
  const saved = (setting.value as FreeTrialValue).chatMessages;
  const [text, setText] = useState(String(saved));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the version changes
  useEffect(() => {
    setText(String(saved));
  }, [setting.version]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-settings", userId] });
  };
  const send = useSingleFlight((chatMessages: number) =>
    updateSetting(FREE_TRIAL_KEY, { expectedVersion: setting.version, value: { chatMessages } }),
  );
  const save = useMutation({
    mutationFn: send,
    onSuccess: refresh,
    onError: (error) => {
      if (isApiError(error, "SETTING_VERSION_CONFLICT")) refresh();
    },
  });
  const problem = freeTrialProblem(text);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!problem && !save.isPending) save.mutate(Number(text.trim()));
  }

  return (
    <section className="card stack" aria-labelledby="free-trial-heading">
      <h2 id="free-trial-heading">التجربة المجانية للمساعد الدراسي</h2>
      <p className="small muted">
        عدد ردود المساعد التي يحصل عليها الطالب مجانًا قبل الاشتراك، مرة واحدة لكل حساب في كل
        الاختبارات. بعدها يُطلب منه الاشتراك. المشترك لا يتأثر بهذا الحد. 0 يجعل المساعد للمشتركين
        فقط.
      </p>
      <p className="small">
        {setting.version === 0
          ? `القيمة الحالية هي الافتراضية (${saved} ردود).`
          : `النسخة ${setting.version} — آخر تعديل ${formatDateTime(setting.updatedAt ?? "")}`}
      </p>
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? (
        <p className="notice notice--success" role="status">
          {`حُفظت النسخة ${save.data.version}. تسري فورًا.`}
        </p>
      ) : null}
      <form className="admin-form" noValidate onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="free-trial-chat">
            الردود المجانية لكل حساب (0–100)
          </label>
          <input
            id="free-trial-chat"
            className="field__input"
            dir="ltr"
            inputMode="numeric"
            value={text}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? "free-trial-error" : undefined}
            onChange={(event) => setText(event.target.value)}
          />
          {problem ? (
            <span id="free-trial-error" className="field__error" role="alert">
              {problem}
            </span>
          ) : null}
        </div>
        <button type="submit" className="btn" disabled={Boolean(problem) || save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ نسخة جديدة"}
        </button>
      </form>
    </section>
  );
}
