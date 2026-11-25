"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice, Loading } from "@/components/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import {
  type AdminUser,
  eraseUser,
  listUsers,
  ROLE_HINTS,
  ROLE_LABELS,
  ROLE_ORDER,
  type RoleCode,
  reactivateUser,
  STATUS_LABELS,
  setUserRoles,
  suspendUser,
} from "@/lib/users-admin-api";

const PAGE_SIZE = 25;
const FILTERS: { value: RoleCode | null; label: string }[] = [
  { value: null, label: "الكل" },
  { value: "STUDENT", label: "الطلاب" },
  { value: "CONTENT_MANAGER", label: "مدراء المحتوى" },
  { value: "ADMIN", label: "مدراء المنصة" },
];

export default function UsersPage() {
  return (
    <AdminGate permission={ADMIN_PERMISSIONS.usersManage}>
      {(me) => <Users selfId={me.user.id} />}
    </AdminGate>
  );
}

function Users({ selfId }: { selfId: string }) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleCode | null>(null);
  const [offset, setOffset] = useState(0);
  const users = useQuery({
    queryKey: ["admin-users", search, role, offset],
    queryFn: () => listUsers({ search, role, limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(draft.trim());
    setOffset(0);
  }

  return (
    <main id="main-content" className="page stack stack--loose">
      <PageHeading
        title="الحسابات والصلاحيات"
        description="كل من سجّل في المنصة. غيّر دور الحساب لتمنحه صلاحيات أو تسحبها، أو أوقفه ليخرج من كل أجهزته فورًا. كل تغيير يُسجَّل في سجل التدقيق."
      />
      <section className="card stack" aria-label="الحسابات">
        <search>
          <form className="row users-search" onSubmit={submit}>
            <label className="visually-hidden" htmlFor="users-search">
              ابحث بالبريد أو الجوال أو الاسم
            </label>
            <input
              id="users-search"
              className="field__input"
              type="search"
              placeholder="ابحث بالبريد أو الجوال أو الاسم"
              maxLength={320}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="btn btn--small">
              بحث
            </button>
          </form>
        </search>
        <fieldset className="row">
          <legend className="visually-hidden">تصفية حسب الدور</legend>
          <div className="chip-group">
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                className="chip"
                aria-pressed={role === filter.value}
                onClick={() => {
                  setRole(filter.value);
                  setOffset(0);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </fieldset>
        {users.isPending ? <Loading /> : null}
        {users.isError ? <ErrorNotice error={users.error} /> : null}
        {users.data?.items.length === 0 ? (
          <EmptyState
            icon="user"
            title="لا حسابات مطابقة"
            description="جرّب بحثًا آخر أو أزل التصفية."
          />
        ) : null}
        {users.data && users.data.items.length > 0 ? (
          <ul className="list">
            {users.data.items.map((user) => (
              <UserEntry key={user.id} user={user} isSelf={user.id === selfId} />
            ))}
          </ul>
        ) : null}
        <nav className="pagination" aria-label="صفحات الحسابات">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={offset === 0 || users.isFetching}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            الأحدث
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!users.data?.page.hasMore || users.isFetching}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            الأقدم
          </button>
        </nav>
      </section>
    </main>
  );
}

function UserEntry({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState<RoleCode[]>(user.roles);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const saveRoles = useMutation({
    mutationFn: () => setUserRoles(user.id, roles),
    onSuccess: refresh,
  });
  const changeStatus = useMutation({
    mutationFn: () =>
      user.status === "SUSPENDED" ? reactivateUser(user.id) : suspendUser(user.id),
    onSuccess: refresh,
  });
  const erase = useMutation({ mutationFn: () => eraseUser(user.id), onSuccess: refresh });
  const erased = user.erasedAt !== null;
  const isStaff = user.roles.some((role) => role !== "STUDENT");
  const changed =
    roles.length !== user.roles.length || roles.some((role) => !user.roles.includes(role));
  const name = erased
    ? "حساب محذوف"
    : (user.displayName ?? user.email ?? user.phone ?? "حساب بلا اسم");

  function toggle(role: RoleCode, checked: boolean) {
    setRoles((current) =>
      checked ? [...current, role] : current.filter((existing) => existing !== role),
    );
  }

  return (
    <li className="audit-entry stack">
      <div className="users-head">
        <strong>{name}</strong>
        <span className={`badge ${user.status === "SUSPENDED" || erased ? "badge--danger" : ""}`}>
          {STATUS_LABELS[user.status]}
        </span>
        {user.roles
          .filter((role) => role !== "STUDENT")
          .map((role) => (
            <span key={role} className="badge badge--accent">
              {ROLE_LABELS[role]}
            </span>
          ))}
        {isSelf ? <span className="small muted">(حسابك)</span> : null}
      </div>
      <span className="small muted">
        {[user.email, user.phone].filter(Boolean).map((contact) => (
          <bdi key={contact} dir="ltr" className="users-contact">
            {contact}
          </bdi>
        ))}
        · سجّل في {formatDate(user.createdAt)}
        {user.lastLoginAt
          ? ` · آخر دخول ${formatDateTime(user.lastLoginAt)}`
          : " · لم يسجّل الدخول بعد"}
      </span>
      {erased ? (
        <p className="small muted">
          حُذف هذا الحساب بطلب صاحبه في {formatDate(user.erasedAt ?? user.createdAt)}. لم يبقَ منه ما
          يدل عليه، ولا يمكن تعديله أو إعادة تفعيله.
        </p>
      ) : isSelf ? (
        <p className="small muted">لا يمكنك تغيير صلاحيات حسابك. اطلب ذلك من مدير آخر.</p>
      ) : (
        <div className="stack">
          <fieldset className="users-roles">
            <legend className="small">الأدوار</legend>
            {ROLE_ORDER.map((role) => (
              <label key={role} className="users-role">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={(event) => toggle(role, event.target.checked)}
                />
                <span>
                  <strong>{ROLE_LABELS[role]}</strong>
                  <small className="muted">{ROLE_HINTS[role]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {saveRoles.isError ? <ErrorNotice error={saveRoles.error} /> : null}
          {changeStatus.isError ? <ErrorNotice error={changeStatus.error} /> : null}
          {erase.isError ? <ErrorNotice error={erase.error} /> : null}
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              disabled={!changed || roles.length === 0 || saveRoles.isPending}
              onClick={() => saveRoles.mutate()}
            >
              {saveRoles.isPending ? "جارٍ الحفظ…" : "حفظ الأدوار"}
            </button>
            {roles.length === 0 ? (
              <span className="small muted">اختر دورًا واحدًا على الأقل.</span>
            ) : null}
            {user.status === "SUSPENDED" ? (
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate()}
              >
                إعادة التفعيل
              </button>
            ) : (
              <ConfirmAction
                label="إيقاف الحساب"
                description={`سيخرج ${name} من كل أجهزته فورًا، ولن يستطيع الدخول حتى تعيد تفعيله.`}
                confirmLabel="أوقف الحساب"
                onConfirm={() => changeStatus.mutate()}
                pending={changeStatus.isPending}
                danger
              />
            )}
            {isStaff ? null : (
              <ConfirmAction
                label="حذف الحساب"
                description={`بطلب من صاحبه فقط: يُحذف بريد ${name} وجواله واسمه وكلمة مروره ومحادثاته نهائيًا، ويبقى سجل مدفوعاته وإجاباته دون ما يدل عليه. لا يمكن التراجع.`}
                confirmLabel="احذف الحساب نهائيًا"
                onConfirm={() => erase.mutate()}
                pending={erase.isPending}
                danger
              />
            )}
          </div>
        </div>
      )}
    </li>
  );
}
