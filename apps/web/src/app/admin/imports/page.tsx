"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { useSingleFlight } from "@/components/admin/use-single-flight";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { countText, formatDateTime, ROWS } from "@/lib/format";
import { listImports, uploadImport } from "@/lib/import-api";
import { BATCH_STATUS_LABELS } from "@/lib/import-mapping";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";

const PAGE_SIZE = 20;
const ACCEPTED = ".csv,.tsv,.json,.xlsx";

export default function AdminImportsPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.questionsCreate}>
      {(me) => <Imports userId={me.user.id} />}
    </AdminGate>
  );
}

function Imports({ userId }: { userId: string }) {
  const [offset, setOffset] = useState(0);
  const batches = useQuery({
    queryKey: ["admin-imports", userId, offset],
    queryFn: () => listImports({ limit: PAGE_SIZE, offset }),
  });

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="استيراد الأسئلة"
        description="ارفع ملفًا منظمًا (CSV أو TSV أو JSON أو Excel)، واربط أعمدته، وراجع الصفوف، ثم أنشئ منها مسودات تمر بالمراجعة المعتادة. لا يُنشر شيء تلقائيًا."
      />
      <UploadForm userId={userId} />

      <section className="card stack" aria-labelledby="imports-heading">
        <h2 id="imports-heading">الملفات المرفوعة</h2>
        {batches.isPending ? <Loading /> : null}
        {batches.isError ? <ErrorNotice error={batches.error} /> : null}
        {batches.data?.items.length === 0 ? (
          <EmptyState title="لا توجد ملفات بعد" description="ارفع أول ملف من النموذج أعلاه." />
        ) : null}
        {batches.data && batches.data.items.length > 0 ? (
          <ul className="list">
            {batches.data.items.map((batch) => (
              <li key={batch.id} className="admin-row">
                <Link href={`/admin/imports/${batch.id}`} className="admin-row__main">
                  <strong>{batch.originalFilename}</strong>
                  <span className="small muted">
                    {`${batch.detectedType} · ${countText(batch.totals?.detected ?? 0, ROWS)} · ${formatDateTime(batch.createdAt)}`}
                  </span>
                </Link>
                <span className="small">{BATCH_STATUS_LABELS[batch.status]}</span>
                <Icon name="chevron" />
              </li>
            ))}
          </ul>
        ) : null}
        <nav className="pagination" aria-label="صفحات الملفات">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset === 0 || batches.isFetching}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          >
            السابق
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!batches.data?.page.hasMore || batches.isFetching}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            التالي
          </button>
        </nav>
      </section>
    </main>
  );
}

function UploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const send = useSingleFlight(async (chosen: File) =>
    uploadImport(chosen.name, new Uint8Array(await chosen.arrayBuffer())),
  );
  const upload = useMutation({
    mutationFn: send,
    onSuccess: async (batch) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-imports", userId] });
      router.push(`/admin/imports/${batch.id}`);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file) upload.mutate(file);
  };

  return (
    <section className="card stack" aria-labelledby="upload-heading">
      <h2 id="upload-heading">ملف جديد</h2>
      <p className="small muted">
        الصف الأول أسماء الأعمدة، وكل صف بعده سؤال. الحد: 2 ميجابايت و1000 صف. من Excel تُقرأ الورقة
        الأولى فقط.
      </p>
      {upload.isError ? <ErrorNotice error={upload.error} /> : null}
      <form className="admin-form" onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="import-file">
            الملف
          </label>
          <input
            id="import-file"
            className="field__input"
            type="file"
            accept={ACCEPTED}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <button type="submit" className="btn" disabled={!file || upload.isPending}>
          {upload.isPending ? "جارٍ الرفع والقراءة…" : "رفع الملف"}
        </button>
      </form>
    </section>
  );
}
