"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { type AdminExam, listAdminExams } from "@/lib/admin-api";
import {
  type AdminEntitlement,
  type AdminPlan,
  activatePlan,
  createPlan,
  ENTITLEMENT_SOURCE_LABELS,
  ENTITLEMENT_STATUS_LABELS,
  grantEntitlement,
  listAdminPlans,
  lookupStudent,
  PLAN_STATUS_LABELS,
  type PlanStatus,
  retirePlan,
  revokeEntitlement,
  type StudentLookup,
  updatePlan,
} from "@/lib/billing-admin-api";
import {
  durationText,
  fromMinorUnits,
  type GrantForm,
  type GrantFormInput,
  grantFormSchema,
  type PlanEdit,
  type PlanEditInput,
  type PlanForm,
  type PlanFormInput,
  planEditSchema,
  planFormSchema,
  toDurationDays,
  toMinorUnits,
} from "@/lib/billing-form";
import { formatDate } from "@/lib/format";
import { formatPrice } from "@/lib/messages";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const DEFAULT_CURRENCY = "SAR";

export default function AdminBillingPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.billingManage}>
      {(me) => <Billing userId={me.user.id} />}
    </AdminGate>
  );
}

function Billing({ userId }: { userId: string }) {
  const exams = useQuery({ queryKey: ["admin-exams", userId], queryFn: listAdminExams });
  const examList = exams.data?.items ?? [];
  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="الباقات والاشتراكات"
        description="أنشئ باقات كل اختبار وحدد أسعارها، وامنح الطلاب وصولًا يدويًا أو ألغِه. كل تفعيل وإلغاء يُسجَّل في سجل التدقيق."
      />
      {exams.isError ? <ErrorNotice error={exams.error} /> : null}
      <Plans userId={userId} exams={examList} />
      <Access exams={examList} />
    </main>
  );
}

function examName(exams: readonly AdminExam[], examId: string): string {
  return exams.find((exam) => exam.id === examId)?.nameAr ?? "اختبار غير معروف";
}

function PlanBadge({ status }: { status: PlanStatus }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      {PLAN_STATUS_LABELS[status]}
    </span>
  );
}

function Plans({ userId, exams }: { userId: string; exams: readonly AdminExam[] }) {
  const plans = useQuery({ queryKey: ["admin-plans", userId], queryFn: listAdminPlans });
  const [examFilter, setExamFilter] = useState("");
  const shown = (plans.data?.items ?? []).filter(
    (plan) => examFilter === "" || plan.examId === examFilter,
  );

  return (
    <>
      <section className="card stack" aria-labelledby="plans-heading">
        <div className="section-head">
          <h2 id="plans-heading">الباقات</h2>
          <label className="inline-field">
            <span className="small muted">الاختبار</span>
            <select
              className="field__input"
              value={examFilter}
              onChange={(event) => setExamFilter(event.target.value)}
            >
              <option value="">كل الاختبارات</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.nameAr}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="small muted">
          الباقة تبدأ مسودة لا يراها الطلاب. بعد عرضها للبيع يُثبَّت سعرها ومدتها، ويمكن إيقاف بيعها
          دون المساس باشتراكات من اشتروها.
        </p>
        {plans.isPending ? <Loading /> : null}
        {plans.isError ? <ErrorNotice error={plans.error} /> : null}
        {plans.data && shown.length === 0 ? (
          <EmptyState
            title="لا توجد باقات بعد"
            description="أنشئ أول باقة من النموذج أدناه، ثم اعرضها للبيع."
          />
        ) : null}
        {shown.length > 0 ? (
          <ul className="list">
            {shown.map((plan) => (
              <PlanRow
                key={plan.id}
                userId={userId}
                plan={plan}
                examName={examName(exams, plan.examId)}
              />
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="new-plan-heading">
        <h2 id="new-plan-heading">باقة جديدة</h2>
        <NewPlanForm userId={userId} exams={exams} />
      </section>
    </>
  );
}

function PlanRow({
  userId,
  plan,
  examName,
}: {
  userId: string;
  plan: AdminPlan;
  examName: string;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-plans", userId] });
  const activate = useMutation({ mutationFn: () => activatePlan(plan.id), onSuccess: refresh });
  const retire = useMutation({ mutationFn: () => retirePlan(plan.id), onSuccess: refresh });

  return (
    <li className="admin-row admin-row--stacked">
      <div className="admin-row__line">
        <span className="admin-row__main">
          <strong>{plan.name}</strong>
          <span className="small muted">{examName}</span>
          <span className="small muted" dir="ltr">
            {plan.code}
          </span>
        </span>
        <span className="plan-figure">
          {formatPrice(plan.price.amountMinor, plan.price.currency)}
        </span>
        <span className="small muted">{durationText(plan.durationDays)}</span>
        <PlanBadge status={plan.status} />
      </div>

      {activate.isError ? <ErrorNotice error={activate.error} /> : null}
      {retire.isError ? <ErrorNotice error={retire.error} /> : null}

      {mode === "edit" ? (
        <EditPlanForm
          plan={plan}
          onDone={async () => {
            setMode("view");
            await refresh();
          }}
          onCancel={() => setMode("view")}
        />
      ) : null}

      {mode === "view" && plan.status !== "RETIRED" ? (
        <div className="row">
          {plan.status === "DRAFT" ? (
            <>
              <button
                type="button"
                className="btn btn--small"
                disabled={activate.isPending}
                onClick={() => activate.mutate()}
              >
                {activate.isPending ? "جارٍ العرض…" : "اعرضها للبيع"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setMode("edit")}
              >
                تعديل
              </button>
            </>
          ) : (
            <ConfirmAction
              label="إيقاف البيع"
              description={`سيتوقف بيع «${plan.name}» نهائيًا. من اشترك بها يحتفظ باشتراكه حتى نهايته.`}
              confirmLabel="أوقف البيع"
              danger
              pending={retire.isPending}
              onConfirm={() => retire.mutate()}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <span id={id} className="field__error" role="alert">
      {message}
    </span>
  ) : null;
}

function NewPlanForm({ userId, exams }: { userId: string; exams: readonly AdminExam[] }) {
  const queryClient = useQueryClient();
  const form = useForm<PlanFormInput, unknown, PlanForm>({
    resolver: zodResolver(planFormSchema),
    defaultValues: { examId: "", code: "", name: "", price: "", durationDays: "" },
  });
  const send = useSingleFlight((values: PlanForm) =>
    createPlan({
      examId: values.examId,
      code: values.code,
      name: values.name,
      priceMinor: toMinorUnits(values.price),
      currency: DEFAULT_CURRENCY,
      durationDays: toDurationDays(values.durationDays),
    }),
  );
  const create = useMutation({
    mutationFn: send,
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin-plans", userId] });
    },
  });
  const errors = form.formState.errors;

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      {create.isError ? <ErrorNotice error={create.error} /> : null}
      {create.isSuccess ? (
        <p className="notice notice--success" role="status">
          أُنشئت الباقة مسودة. اعرضها للبيع من القائمة أعلاه حين تكون جاهزة.
        </p>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor="plan-exam">
          الاختبار
        </label>
        <select
          id="plan-exam"
          className="field__input"
          aria-invalid={errors.examId ? true : undefined}
          {...form.register("examId")}
        >
          <option value="">— اختر —</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.nameAr}
            </option>
          ))}
        </select>
        <FieldError id="plan-exam-error" message={errors.examId?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="plan-name">
          اسم الباقة
        </label>
        <input id="plan-name" className="field__input" {...form.register("name")} />
        <FieldError id="plan-name-error" message={errors.name?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="plan-code">
          الرمز
        </label>
        <input
          id="plan-code"
          className="field__input"
          dir="ltr"
          aria-describedby="plan-code-hint"
          {...form.register("code")}
        />
        <span id="plan-code-hint" className="field__hint">
          فريد ولا يتغير، مثل QUDURAT-90.
        </span>
        <FieldError id="plan-code-error" message={errors.code?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="plan-price">
          السعر (ر.س)
        </label>
        <input
          id="plan-price"
          className="field__input"
          dir="ltr"
          inputMode="decimal"
          aria-invalid={errors.price ? true : undefined}
          {...form.register("price")}
        />
        <FieldError id="plan-price-error" message={errors.price?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="plan-duration">
          المدة بالأيام
        </label>
        <input
          id="plan-duration"
          className="field__input"
          dir="ltr"
          inputMode="numeric"
          aria-describedby="plan-duration-hint"
          {...form.register("durationDays")}
        />
        <span id="plan-duration-hint" className="field__hint">
          اتركه فارغًا لوصول بلا نهاية.
        </span>
        <FieldError id="plan-duration-error" message={errors.durationDays?.message} />
      </div>
      <button type="submit" className="btn" disabled={create.isPending}>
        {create.isPending ? "جارٍ الإنشاء…" : "إنشاء الباقة"}
      </button>
    </form>
  );
}

function EditPlanForm({
  plan,
  onDone,
  onCancel,
}: {
  plan: AdminPlan;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<PlanEditInput, unknown, PlanEdit>({
    resolver: zodResolver(planEditSchema),
    defaultValues: {
      name: plan.name,
      price: fromMinorUnits(plan.price.amountMinor),
      durationDays: plan.durationDays === null ? "" : String(plan.durationDays),
    },
  });
  const send = useSingleFlight((values: PlanEdit) =>
    updatePlan(plan.id, {
      name: values.name,
      priceMinor: toMinorUnits(values.price),
      durationDays: toDurationDays(values.durationDays),
    }),
  );
  const save = useMutation({ mutationFn: send, onSuccess: onDone });
  const errors = form.formState.errors;
  const prefix = `edit-${plan.id}`;

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <ErrorNotice error={save.error} /> : null}
      <div className="field">
        <label className="field__label" htmlFor={`${prefix}-name`}>
          اسم الباقة
        </label>
        <input id={`${prefix}-name`} className="field__input" {...form.register("name")} />
        <FieldError id={`${prefix}-name-error`} message={errors.name?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${prefix}-price`}>
          السعر (ر.س)
        </label>
        <input
          id={`${prefix}-price`}
          className="field__input"
          dir="ltr"
          inputMode="decimal"
          {...form.register("price")}
        />
        <FieldError id={`${prefix}-price-error`} message={errors.price?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${prefix}-duration`}>
          المدة بالأيام
        </label>
        <input
          id={`${prefix}-duration`}
          className="field__input"
          dir="ltr"
          inputMode="numeric"
          {...form.register("durationDays")}
        />
        <FieldError id={`${prefix}-duration-error`} message={errors.durationDays?.message} />
      </div>
      <div className="admin-form__actions row">
        <button type="submit" className="btn btn--small" disabled={save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

function Access({ exams }: { exams: readonly AdminExam[] }) {
  const [identifier, setIdentifier] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const lookup = useQuery({
    queryKey: ["admin-student-lookup", searched],
    queryFn: () => lookupStudent(searched ?? ""),
    enabled: searched !== null,
    retry: false,
  });

  return (
    <section className="card stack" aria-labelledby="access-heading">
      <h2 id="access-heading">وصول الطلاب</h2>
      <p className="small muted">
        ابحث عن الطالب ببريده الإلكتروني أو رقم جواله كما سجّل به، لترى اشتراكاته وتمنحه وصولًا أو
        تلغيه.
      </p>
      <form
        className="lookup-form"
        onSubmit={(event) => {
          event.preventDefault();
          const value = identifier.trim();
          if (value) setSearched(value);
        }}
      >
        <label className="visually-hidden" htmlFor="student-identifier">
          البريد الإلكتروني أو رقم الجوال
        </label>
        <input
          id="student-identifier"
          className="field__input"
          dir="ltr"
          placeholder="student@example.com أو ‎+9665XXXXXXXX"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
        <button type="submit" className="btn" disabled={lookup.isFetching}>
          {lookup.isFetching ? "جارٍ البحث…" : "بحث"}
        </button>
      </form>
      {lookup.isError ? <ErrorNotice error={lookup.error} /> : null}
      {lookup.data ? (
        <StudentAccess
          key={lookup.data.student.id}
          found={lookup.data}
          exams={exams}
          searched={searched ?? ""}
        />
      ) : null}
    </section>
  );
}

function StudentAccess({
  found,
  exams,
  searched,
}: {
  found: StudentLookup;
  exams: readonly AdminExam[];
  searched: string;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-student-lookup", searched] });
  const { student, entitlements } = found;
  return (
    <div className="stack">
      <div className="student-card">
        <span className="user-avatar" aria-hidden="true">
          {student.displayName?.trim().charAt(0) || "؟"}
        </span>
        <div>
          <strong>{student.displayName ?? "بدون اسم"}</strong>
          <span className="small muted" dir="ltr">
            {[student.email, student.phone].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      <h3>الاشتراكات</h3>
      {entitlements.length === 0 ? (
        <p className="small muted">لا توجد اشتراكات لهذا الطالب.</p>
      ) : (
        <ul className="list">
          {entitlements.map((entitlement) => (
            <EntitlementRow
              key={entitlement.id}
              entitlement={entitlement}
              examName={examName(exams, entitlement.examId)}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
      <h3>منح وصول</h3>
      <GrantAccessForm studentId={student.id} exams={exams} onGranted={refresh} />
    </div>
  );
}

function EntitlementRow({
  entitlement,
  examName,
  onChanged,
}: {
  entitlement: AdminEntitlement;
  examName: string;
  onChanged: () => Promise<void>;
}) {
  const revoke = useMutation({
    mutationFn: () => revokeEntitlement(entitlement.id),
    onSuccess: onChanged,
  });
  const period = `${formatDate(entitlement.startsAt)} — ${entitlement.endsAt ? formatDate(entitlement.endsAt) : "بلا نهاية"}`;
  return (
    <li className="admin-row admin-row--stacked">
      <div className="admin-row__line">
        <span className="admin-row__main">
          <strong>{examName}</strong>
          <span className="small muted">{ENTITLEMENT_SOURCE_LABELS[entitlement.source]}</span>
          <span className="small muted">{period}</span>
        </span>
        <span className={`status-badge status-badge--${entitlement.status.toLowerCase()}`}>
          {ENTITLEMENT_STATUS_LABELS[entitlement.status]}
        </span>
        {entitlement.status === "ACTIVE" ? (
          <ConfirmAction
            label="إلغاء الوصول"
            description="سيفقد الطالب مزايا الباقة في هذا الاختبار فورًا. تبقى إجاباته وملف مهاراته محفوظة."
            confirmLabel="ألغِ الوصول"
            danger
            pending={revoke.isPending}
            onConfirm={() => revoke.mutate()}
          />
        ) : null}
      </div>
      {revoke.isError ? <ErrorNotice error={revoke.error} /> : null}
    </li>
  );
}

function GrantAccessForm({
  studentId,
  exams,
  onGranted,
}: {
  studentId: string;
  exams: readonly AdminExam[];
  onGranted: () => Promise<void>;
}) {
  const form = useForm<GrantFormInput, unknown, GrantForm>({
    resolver: zodResolver(grantFormSchema),
    defaultValues: { examId: "", durationDays: "30" },
  });
  const send = useSingleFlight((values: GrantForm) =>
    grantEntitlement({
      studentId,
      examId: values.examId,
      durationDays: toDurationDays(values.durationDays),
    }),
  );
  const grant = useMutation({
    mutationFn: send,
    onSuccess: async () => {
      form.reset();
      await onGranted();
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={form.handleSubmit((values) => grant.mutate(values))}
    >
      {grant.isError ? <ErrorNotice error={grant.error} /> : null}
      {grant.isSuccess ? (
        <p className="notice notice--success" role="status">
          مُنح الوصول. إن كان للطالب وصول قائم، يبدأ الجديد بعد انتهائه.
        </p>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor="grant-exam">
          الاختبار
        </label>
        <select id="grant-exam" className="field__input" {...form.register("examId")}>
          <option value="">— اختر —</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.nameAr}
            </option>
          ))}
        </select>
        <FieldError id="grant-exam-error" message={errors.examId?.message} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="grant-duration">
          المدة بالأيام
        </label>
        <input
          id="grant-duration"
          className="field__input"
          dir="ltr"
          inputMode="numeric"
          aria-describedby="grant-duration-hint"
          {...form.register("durationDays")}
        />
        <span id="grant-duration-hint" className="field__hint">
          اتركه فارغًا لوصول بلا نهاية.
        </span>
        <FieldError id="grant-duration-error" message={errors.durationDays?.message} />
      </div>
      <button type="submit" className="btn" disabled={grant.isPending}>
        {grant.isPending ? "جارٍ المنح…" : "امنح الوصول"}
      </button>
    </form>
  );
}
