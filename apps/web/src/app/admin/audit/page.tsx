"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { type AuditFilter, listAuditLogs } from "@/lib/admin-insights-api";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.auditView}>
      {(me) => <Audit userId={me.user.id} />}
    </AdminGate>
  );
}

function Audit({ userId }: { userId: string }) {
  const [draft, setDraft] = useState({ action: "", resourceType: "" });
  const [filter, setFilter] = useState<AuditFilter>({
    action: "",
    resourceType: "",
    limit: PAGE_SIZE,
    offset: 0,
  });
  const entries = useQuery({
    queryKey: ["admin-audit", userId, filter],
    queryFn: () => listAuditLogs(filter),
    placeholderData: keepPreviousData,
  });
  const apply = (event: FormEvent) => {
    event.preventDefault();
    setFilter({ ...draft, limit: PAGE_SIZE, offset: 0 });
  };

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="سجل التدقيق"
        description="سجل دائم لكل تغيير حساس: من فعله، ومتى، وعلى ماذا. لا يُعدَّل ولا يُحذف."
      />
      <form className="admin-form audit-filter" onSubmit={apply}>
        <div className="field">
          <label className="field__label" htmlFor="audit-action">
            الإجراء
          </label>
          <input
            id="audit-action"
            className="field__input"
            dir="ltr"
            placeholder="question.publish"
            value={draft.action}
            onChange={(event) => setDraft({ ...draft, action: event.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="audit-resource">
            نوع المورد
          </label>
          <input
            id="audit-resource"
            className="field__input"
            dir="ltr"
            placeholder="assessment_blueprint"
            value={draft.resourceType}
            onChange={(event) => setDraft({ ...draft, resourceType: event.target.value })}
          />
        </div>
        <button type="submit" className="btn">
          تصفية
        </button>
      </form>

      <section className="card stack" aria-label="الإدخالات">
        {entries.isPending ? <Loading /> : null}
        {entries.isError ? <ErrorNotice error={entries.error} /> : null}
        {entries.data?.items.length === 0 ? (
          <p className="muted">لا إدخالات بهذه التصفية.</p>
        ) : null}
        {entries.data ? (
          <ul className="list">
            {entries.data.items.map((entry) => (
              <li key={entry.id} className="audit-entry">
                <div className="audit-entry__head">
                  <strong dir="ltr">{entry.action}</strong>
                  <span className="small muted">
                    {new Date(entry.createdAt).toLocaleString("ar-SA")}
                  </span>
                </div>
                <span className="small">
                  {`${entry.actor ? (entry.actor.displayName ?? entry.actor.email ?? "حساب بلا اسم") : "حساب غير متاح"} · `}
                  <bdi dir="ltr">{`${entry.resourceType}${entry.resourceId ? ` ${entry.resourceId}` : ""}`}</bdi>
                </span>
                {entry.metadata ? (
                  <details>
                    <summary className="small">التفاصيل</summary>
                    <pre className="audit-entry__metadata" dir="ltr">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <nav className="pagination" aria-label="صفحات السجل">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={filter.offset === 0 || entries.isFetching}
            onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - PAGE_SIZE) })}
          >
            الأحدث
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!entries.data?.page.hasMore || entries.isFetching}
            onClick={() => setFilter({ ...filter, offset: filter.offset + PAGE_SIZE })}
          >
            الأقدم
          </button>
        </nav>
      </section>
    </main>
  );
}
