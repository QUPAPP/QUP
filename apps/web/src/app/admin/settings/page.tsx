"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { AdminGate } from "@/components/admin/admin-gate";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { daysText } from "@/lib/full-reassessment";
import { answersText } from "@/lib/mastery-labels";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import {
  GATE_KEY,
  LEVELS_KEY,
  listSettings,
  listSettingVersions,
  type SettingView,
  updateSetting,
} from "@/lib/settings-api";
import {
  formFromGate,
  formFromLevels,
  type GateForm,
  type GateFormInput,
  type GateValue,
  gateFormSchema,
  LEVEL_LABELS,
  LEVEL_ORDER,
  type LevelsForm,
  type LevelsFormInput,
  type LevelsValue,
  levelsFormSchema,
  toGateValue,
  toLevelsValue,
} from "@/lib/settings-form";

export default function AdminSettingsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.settingsManage}>
      {(me) => <Settings userId={me.user.id} />}
    </AdminGate>
  );
}

function Settings({ userId }: { userId: string }) {
  const settings = useQuery({ queryKey: ["admin-settings", userId], queryFn: listSettings });
  const levels = settings.data?.items.find((item) => item.key === LEVELS_KEY);
  const gate = settings.data?.items.find((item) => item.key === GATE_KEY);

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="الإعدادات"
        description="كل حفظ يضيف نسخة جديدة ولا يمحو ما قبلها، فتبقى النتائج السابقة قابلة للتفسير."
      />
      {settings.isPending ? <Loading /> : null}
      {settings.isError ? (
        <ErrorNotice error={settings.error}>
          <button type="button" className="btn btn--small" onClick={() => settings.refetch()}>
            إعادة المحاولة
          </button>
        </ErrorNotice>
      ) : null}
      {levels ? <LevelBoundaries userId={userId} setting={levels} /> : null}
      {gate ? <ReDiagnosticGate userId={userId} setting={gate} /> : null}
    </main>
  );
}

function LevelBoundaries({ userId, setting }: { userId: string; setting: SettingView }) {
  const queryClient = useQueryClient();
  const form = useForm<LevelsFormInput, unknown, LevelsForm>({
    resolver: zodResolver(levelsFormSchema),
    defaultValues: formFromLevels(setting.value as LevelsValue),
  });
  // A newer version arrived (ours or someone else's): show its values, keeping any message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the version changes
  useEffect(() => {
    form.reset(formFromLevels(setting.value as LevelsValue));
  }, [setting.version]);
  const versions = useQuery({
    queryKey: ["admin-setting-versions", userId, LEVELS_KEY],
    queryFn: () => listSettingVersions(LEVELS_KEY),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-settings", userId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-setting-versions", userId] });
  };
  const send = useSingleFlight((values: LevelsForm) =>
    updateSetting(LEVELS_KEY, { expectedVersion: setting.version, value: toLevelsValue(values) }),
  );
  const save = useMutation({
    mutationFn: send,
    onSuccess: refresh,
    // Someone saved first: show their values; the message says to review and save again.
    onError: (error) => {
      if (isApiError(error, "SETTING_VERSION_CONFLICT")) refresh();
    },
  });
  const errors = form.formState.errors.boundaries;

  return (
    <section className="card stack" aria-labelledby="levels-heading">
      <h2 id="levels-heading">حدود المستوى التشخيصي</h2>
      <p className="small muted">
        أقل نسبة أداء في التشخيص المصغّر يبدأ عندها كل مستوى. يسري التغيير على التشخيصات الجديدة فقط؛
        نتائج التشخيصات السابقة تبقى كما هي.
      </p>
      <p className="small">
        {setting.version === 0
          ? "القيم الحالية هي الافتراضية (لم يُحفظ أي تغيير بعد)."
          : `النسخة ${setting.version} — آخر تعديل ${formatDateTime(setting.updatedAt ?? "")}`}
      </p>
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? (
        <p className="notice notice--success" role="status">
          {`حُفظت النسخة ${save.data.version}. تسري على التشخيصات الجديدة.`}
        </p>
      ) : null}
      <form
        className="admin-form"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        {LEVEL_ORDER.map((level, index) => {
          const id = `level-${level}`;
          const error = errors?.[index]?.message;
          const isLowest = index === 0;
          return (
            <div key={level} className="field">
              <label className="field__label" htmlFor={id}>
                {`${LEVEL_LABELS[level]} — من ٪`}
              </label>
              <input
                id={id}
                className="field__input"
                dir="ltr"
                inputMode="numeric"
                readOnly={isLowest}
                aria-invalid={error ? true : undefined}
                aria-describedby={isLowest ? `${id}-hint` : error ? `${id}-error` : undefined}
                {...form.register(`boundaries.${index}` as const)}
              />
              {isLowest ? (
                <span id={`${id}-hint`} className="field__hint">
                  يبدأ أدنى مستوى دائمًا من 0.
                </span>
              ) : null}
              {error ? (
                <span id={`${id}-error`} className="field__error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
        <button type="submit" className="btn" disabled={save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ نسخة جديدة"}
        </button>
      </form>

      <h3>السجل</h3>
      {versions.isError ? <ErrorNotice error={versions.error} /> : null}
      {versions.data ? (
        <ol className="list">
          {versions.data.items.map((version) => (
            <li key={version.version} className="admin-row">
              <span className="admin-row__main">
                <strong>{version.version === 0 ? "الافتراضي" : `النسخة ${version.version}`}</strong>
                <span className="small muted" dir="ltr">
                  {(version.value as LevelsValue).map((band) => band.fromPercentage).join(" · ")}
                </span>
                {version.updatedAt ? (
                  <span className="small muted">{formatDateTime(version.updatedAt)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** PRD §8: when a student may take the full re-diagnostic again. Bounds are the API's rule. */
function ReDiagnosticGate({ userId, setting }: { userId: string; setting: SettingView }) {
  const queryClient = useQueryClient();
  const form = useForm<GateFormInput, unknown, GateForm>({
    resolver: zodResolver(gateFormSchema),
    defaultValues: formFromGate(setting.value as GateValue),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the version changes
  useEffect(() => {
    form.reset(formFromGate(setting.value as GateValue));
  }, [setting.version]);
  const versions = useQuery({
    queryKey: ["admin-setting-versions", userId, GATE_KEY],
    queryFn: () => listSettingVersions(GATE_KEY),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-settings", userId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-setting-versions", userId] });
  };
  const send = useSingleFlight((values: GateForm) =>
    updateSetting(GATE_KEY, { expectedVersion: setting.version, value: toGateValue(values) }),
  );
  const save = useMutation({
    mutationFn: send,
    onSuccess: refresh,
    onError: (error) => {
      if (isApiError(error, "SETTING_VERSION_CONFLICT")) refresh();
    },
  });
  const errors = form.formState.errors;
  const fields = [
    { name: "cooldownDays", label: "أيام الانتظار بعد آخر قياس كامل (0–365)" },
    { name: "minTrainingAttempts", label: "إجابات التدريب المطلوبة بعده (0–1000)" },
  ] as const;

  return (
    <section className="card stack" aria-labelledby="gate-heading">
      <h2 id="gate-heading">شروط إعادة التشخيص الشامل</h2>
      <p className="small muted">
        متى يستطيع الطالب أن يقيس الاختبار كله من جديد: بعد مدة من آخر تشخيص كامل أو إعادة تشخيص،
        وبعد عدد من إجابات التدريب منذه. يجب أن يتحقق الشرطان معًا، و0 يلغي الشرط.
      </p>
      <p className="small">
        {setting.version === 0
          ? "القيم الحالية هي الافتراضية (7 أيام و30 إجابة)."
          : `النسخة ${setting.version} — آخر تعديل ${formatDateTime(setting.updatedAt ?? "")}`}
      </p>
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? (
        <p className="notice notice--success" role="status">
          {`حُفظت النسخة ${save.data.version}. تسري فورًا على كل الطلاب.`}
        </p>
      ) : null}
      <form
        className="admin-form"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        {fields.map(({ name, label }) => {
          const id = `gate-${name}`;
          const error = errors[name]?.message;
          return (
            <div key={name} className="field">
              <label className="field__label" htmlFor={id}>
                {label}
              </label>
              <input
                id={id}
                className="field__input"
                dir="ltr"
                inputMode="numeric"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                {...form.register(name)}
              />
              {error ? (
                <span id={`${id}-error`} className="field__error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
        <button type="submit" className="btn" disabled={save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ نسخة جديدة"}
        </button>
      </form>

      <h3>السجل</h3>
      {versions.isError ? <ErrorNotice error={versions.error} /> : null}
      {versions.data ? (
        <ol className="list">
          {versions.data.items.map((version) => {
            const value = version.value as GateValue;
            return (
              <li key={version.version} className="admin-row">
                <span className="admin-row__main">
                  <strong>
                    {version.version === 0 ? "الافتراضي" : `النسخة ${version.version}`}
                  </strong>
                  <span className="small muted">
                    {`${daysText(value.cooldownDays)} · ${answersText(value.minTrainingAttempts)}`}
                  </span>
                  {version.updatedAt ? (
                    <span className="small muted">{formatDateTime(version.updatedAt)}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
