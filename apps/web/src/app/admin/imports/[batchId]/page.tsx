"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { COLUMNS, countText, ROWS } from "@/lib/format";
import {
  createImportDrafts,
  getImport,
  type ImportBatch,
  type ImportItem,
  type ImportItemStatus,
  listImportItems,
  processImport,
  resolveImportItem,
} from "@/lib/import-api";
import {
  BATCH_STATUS_LABELS,
  formFromBatch,
  ITEM_STATUS_LABELS,
  MAPPING_FIELDS,
  MAX_OPTIONS,
  type MappingForm,
  mappingFormSchema,
  rowErrorLabel,
  toProcessBody,
} from "@/lib/import-mapping";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { listAuthoringTaxonomies } from "@/lib/question-api";

const PAGE_SIZE = 50;
const OPTION_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];
const STATUS_FILTERS: (ImportItemStatus | "")[] = [
  "",
  "VALID",
  "INVALID",
  "DUPLICATE",
  "IMPORTED",
  "SKIPPED",
];

export default function AdminImportPage() {
  const { batchId } = useParams<{ batchId: string }>();
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => <Import userId={me.user.id} batchId={batchId} />}
    </AdminGate>
  );
}

function Import({ userId, batchId }: { userId: string; batchId: string }) {
  const queryClient = useQueryClient();
  const batch = useQuery({
    queryKey: ["admin-import", userId, batchId],
    queryFn: () => getImport(batchId),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-import", userId, batchId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-import-items", userId, batchId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-imports", userId] }),
    ]);

  if (batch.isPending) {
    return (
      <main id="main-content" className="page">
        <Loading />
      </main>
    );
  }
  if (batch.isError) {
    return (
      <main id="main-content" className="page">
        <ErrorNotice error={batch.error}>
          <Link href="/admin/imports" className="btn btn--small">
            كل الملفات
          </Link>
        </ErrorNotice>
      </main>
    );
  }

  const current = batch.data;
  const imported = (current.totals?.imported ?? 0) > 0;
  return (
    <main id="main-content" className="page stack stack--loose">
      <Link href="/admin/imports" className="text-link">
        كل الملفات <Icon name="arrow" />
      </Link>
      <PageHeading
        title={current.originalFilename}
        description={`${current.detectedType} · ${countText(current.headers.length, COLUMNS)} · ${BATCH_STATUS_LABELS[current.status]}`}
      />
      {imported ? null : <MappingSection batch={current} onProcessed={refresh} />}
      {current.totals && current.status !== "UPLOADED" ? <Report batch={current} /> : null}
      {current.status !== "UPLOADED" ? (
        <>
          <CreateDrafts batch={current} onDone={refresh} />
          <Rows userId={userId} batch={current} onChanged={refresh} />
        </>
      ) : null}
    </main>
  );
}

function MappingSection({
  batch,
  onProcessed,
}: {
  batch: ImportBatch;
  onProcessed: () => Promise<unknown>;
}) {
  const taxonomies = useQuery({
    queryKey: ["authoring-taxonomies"],
    queryFn: listAuthoringTaxonomies,
  });
  const form = useForm<MappingForm>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: formFromBatch(batch),
  });
  // A newer mapping was saved: show it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the batch's mapping changes
  useEffect(() => {
    form.reset(formFromBatch(batch));
  }, [batch.status, batch.taxonomyVersionId]);
  const send = useSingleFlight((values: MappingForm) =>
    processImport(batch.id, toProcessBody(values)),
  );
  const process = useMutation({ mutationFn: send, onSuccess: onProcessed });
  const errors = form.formState.errors;
  const columnOptions = (
    <>
      <option value="">— بدون —</option>
      {batch.headers.map((header) => (
        <option key={header} value={header}>
          {header}
        </option>
      ))}
    </>
  );

  return (
    <section className="card stack" aria-labelledby="mapping-heading">
      <h2 id="mapping-heading">ربط الأعمدة</h2>
      <p className="small muted">
        اقترحنا ربطًا من أسماء الأعمدة؛ راجعه ثم افحص الصفوف. يمكنك تعديله وإعادة الفحص ما لم تُنشأ
        المسودات.
      </p>
      {process.isError ? <ErrorNotice error={process.error} /> : null}
      <form
        className="admin-form"
        noValidate
        onSubmit={form.handleSubmit((values) => process.mutate(values))}
      >
        <div className="field">
          <label className="field__label" htmlFor="import-version">
            نسخة التصنيف
          </label>
          <select
            id="import-version"
            className="field__input"
            {...form.register("taxonomyVersionId")}
          >
            <option value="">— اختر —</option>
            {taxonomies.data?.items.flatMap((entry) =>
              entry.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {`${entry.exam.nameAr} — ${version.versionCode}${version.status === "DRAFT" ? " (مسودة)" : ""}`}
                </option>
              )),
            )}
          </select>
          {errors.taxonomyVersionId ? (
            <span className="field__error" role="alert">
              {errors.taxonomyVersionId.message}
            </span>
          ) : null}
        </div>

        {MAPPING_FIELDS.map(({ field, label }) => {
          const id = `import-${field}`;
          const error = errors[field]?.message;
          return (
            <div key={field} className="field">
              <label className="field__label" htmlFor={id}>
                {label}
              </label>
              <select
                id={id}
                className="field__input"
                aria-invalid={error ? true : undefined}
                {...form.register(field)}
              >
                {columnOptions}
              </select>
              {error ? (
                <span className="field__error" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}

        <fieldset className="stack">
          <legend className="field__label">الخيارات (عمود لكل خيار، بالترتيب)</legend>
          {Array.from({ length: MAX_OPTIONS }, (_, index) => {
            const id = `import-option-${index}`;
            return (
              <div key={id} className="field">
                <label className="field__label" htmlFor={id}>
                  {`الخيار ${OPTION_LETTERS[index]}`}
                </label>
                <select
                  id={id}
                  className="field__input"
                  {...form.register(`options.${index}` as const)}
                >
                  {columnOptions}
                </select>
              </div>
            );
          })}
          {errors.options ? (
            <span className="field__error" role="alert">
              {errors.options.message ?? errors.options.root?.message}
            </span>
          ) : null}
        </fieldset>

        <button type="submit" className="btn" disabled={process.isPending}>
          {process.isPending ? "جارٍ الفحص…" : "فحص الصفوف"}
        </button>
      </form>
    </section>
  );
}

function Report({ batch }: { batch: ImportBatch }) {
  const totals = batch.totals;
  if (!totals) return null;
  const counts: [string, number][] = [
    ["الصفوف", totals.detected],
    ["جاهزة", totals.valid],
    ["تحتاج تصحيحًا", totals.invalid],
    ["مكررة", totals.duplicate],
    ["أُنشئت مسوداتها", totals.imported],
    ["متجاوزة", totals.skipped],
  ];
  const problems = Object.entries(totals.errors).sort((a, b) => b[1] - a[1]);
  return (
    <section className="card stack" aria-labelledby="report-heading">
      <h2 id="report-heading">تقرير الفحص</h2>
      <ul className="profile-summary">
        {counts.map(([label, value]) => (
          <li key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      {problems.length > 0 ? (
        <ul className="list">
          {problems.map(([code, rows]) => (
            <li key={code} className="list__item list__item--weakness">
              <span>{rowErrorLabel(code)}</span>
              <span className="small">{countText(rows, ROWS)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CreateDrafts({ batch, onDone }: { batch: ImportBatch; onDone: () => Promise<unknown> }) {
  const send = useSingleFlight(() => createImportDrafts(batch.id));
  const create = useMutation({ mutationFn: send, onSuccess: onDone });
  const ready = batch.totals?.valid ?? 0;
  return (
    <section className="card stack" aria-labelledby="drafts-heading">
      <h2 id="drafts-heading">إنشاء المسودات</h2>
      {create.isError ? <ErrorNotice error={create.error} /> : null}
      {ready > 0 ? (
        <ConfirmAction
          label={`إنشاء ${ready} مسودة`}
          description="تُنشأ مسودة لكل صف جاهز، مع ذكر الملف ورقم الصف مصدرًا. المسودات تمر بالمراجعة المعتادة قبل أي نشر."
          pending={create.isPending}
          onConfirm={() => create.mutate()}
        />
      ) : (
        <p className="small muted">
          {(batch.totals?.imported ?? 0) > 0
            ? "أُنشئت المسودات. تجدها في بنك الأسئلة بحالة مسودة."
            : "لا توجد صفوف جاهزة بعد."}
        </p>
      )}
    </section>
  );
}

function Rows({
  userId,
  batch,
  onChanged,
}: {
  userId: string;
  batch: ImportBatch;
  onChanged: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState<ImportItemStatus | "">("");
  const [offset, setOffset] = useState(0);
  const items = useQuery({
    queryKey: ["admin-import-items", userId, batch.id, status, offset],
    queryFn: () =>
      listImportItems(batch.id, { limit: PAGE_SIZE, offset, ...(status ? { status } : {}) }),
    placeholderData: keepPreviousData,
  });
  const resolve = useMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: "SKIP" | "INCLUDE" }) =>
      resolveImportItem(itemId, action),
    onSuccess: onChanged,
  });

  return (
    <section className="card stack" aria-labelledby="rows-heading">
      <div className="history-toolbar">
        <h2 id="rows-heading">الصفوف</h2>
        <div className="history-filter">
          <label htmlFor="row-status">الحالة</label>
          <select
            id="row-status"
            className="field__input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ImportItemStatus | "");
              setOffset(0);
            }}
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? ITEM_STATUS_LABELS[value] : "كل الصفوف"}
              </option>
            ))}
          </select>
        </div>
      </div>
      {resolve.isError ? <ErrorNotice error={resolve.error} /> : null}
      {items.isPending ? <Loading /> : null}
      {items.isError ? <ErrorNotice error={items.error} /> : null}
      {items.data ? (
        <ul className="list">
          {items.data.items.map((item) => (
            <Row
              key={item.id}
              item={item}
              stemColumn={batch.mapping?.stem}
              pending={resolve.isPending}
              onResolve={(action) => resolve.mutate({ itemId: item.id, action })}
            />
          ))}
        </ul>
      ) : null}
      <nav className="pagination" aria-label="صفحات الصفوف">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={offset === 0 || items.isFetching}
          onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
        >
          السابق
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!items.data?.page.hasMore || items.isFetching}
          onClick={() => setOffset((value) => value + PAGE_SIZE)}
        >
          التالي
        </button>
      </nav>
    </section>
  );
}

function Row({
  item,
  stemColumn,
  pending,
  onResolve,
}: {
  item: ImportItem;
  stemColumn: string | undefined;
  pending: boolean;
  onResolve: (action: "SKIP" | "INCLUDE") => void;
}) {
  const stem = item.question?.stem ?? (stemColumn ? item.cells[stemColumn] : "") ?? "";
  const canSkip = item.status !== "IMPORTED" && item.status !== "SKIPPED";
  const canInclude = item.status === "DUPLICATE" || item.status === "SKIPPED";
  return (
    <li className="admin-row import-row">
      <div className="admin-row__main">
        <strong>{stem || "—"}</strong>
        <span className="small muted">
          {`${item.sourceLocator.replace("row", "صف")} · ${ITEM_STATUS_LABELS[item.status]}`}
        </span>
        {item.errors.length > 0 && item.status !== "VALID" && item.status !== "IMPORTED" ? (
          <ul className="import-row__errors">
            {item.errors.map((code) => (
              <li key={code} className="small">
                {rowErrorLabel(code)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="row">
        {item.resultingQuestionVersionId ? (
          <Link
            href={`/admin/question-versions/${item.resultingQuestionVersionId}`}
            className="text-link"
          >
            المسودة <Icon name="chevron" />
          </Link>
        ) : null}
        {canInclude ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={pending}
            onClick={() => onResolve("INCLUDE")}
          >
            {item.status === "DUPLICATE" ? "ليس مكررًا، أدرجه" : "تراجع عن التجاوز"}
          </button>
        ) : null}
        {canSkip ? (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={pending}
            onClick={() => onResolve("SKIP")}
          >
            تجاوز
          </button>
        ) : null}
      </div>
    </li>
  );
}
