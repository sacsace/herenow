"use client";

import { AdminCompanySettings } from "@/components/admin/AdminCompanySettings";
import { AdminTodayOverview } from "@/components/admin/AdminTodayOverview";
import { MonthlyAttendanceOverview } from "@/components/admin/MonthlyAttendanceOverview";
import { SuperCompanyAttendanceStats } from "@/components/super/SuperCompanyAttendanceStats";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/components/LanguageProvider";
import {
  btnDestructive,
  btnPrimaryLg,
  cardBodyLg,
  emptyStateLg,
  errorText,
  formGridFull,
  formGridLg,
  groupedCardLg,
  inputLg,
  inputTableLabelLg,
  labelLg,
  linkBackLg,
  pageStackDetailLg,
  sectionLabelLg,
  selectLg,
  tableHeadLg,
  tableLg,
  tableRow,
  tableWrapLg,
  tdEmailLg,
  tdNameLg,
  tdStatusLg,
  thLg,
} from "@/lib/uiStyles";
import { statusBadge } from "@/lib/statusBadge";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type RowUser = {
  id: string;
  email: string;
  role: string;
  consentGivenAt: string | null;
  createdAt: string;
  employee: { id: string; name: string } | null;
};

type CompanyDetail = {
  id: string;
  name: string;
  seatLimit: number;
  subscriptionEndsAt: string | null;
  _count: { users: number; employees: number; attendanceRecords: number };
};

const ADD_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "EMPLOYEE"] as const;

export default function SuperCompanyUsersPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<RowUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ADD_ROLES)[number]>("EMPLOYEE");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [savingNameId, setSavingNameId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "dashboard" | "stats">("users");

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    setNotFound(false);
    const [cr, ur] = await Promise.all([
      fetch(`/api/super/companies/${id}`),
      fetch(`/api/super/companies/${id}/users`),
    ]);
    const cj = await cr.json().catch(() => ({}));
    const uj = await ur.json().catch(() => ({}));
    if (cr.ok) {
      setCompany(cj.company ?? null);
      setNotFound(!cj.company);
    } else {
      setCompany(null);
      setNotFound(cr.status === 404);
      setLoadError(typeof cj.error === "string" ? cj.error : null);
    }
    if (ur.ok) setUsers(uj.users ?? []);
    else setUsers([]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const m: Record<string, string> = {};
    for (const u of users) {
      m[u.id] = u.employee?.name ?? "";
    }
    setNameDraft(m);
  }, [users]);

  function roleLabel(r: string) {
    switch (r) {
      case "COMPANY_ADMIN":
        return t("super.roleCompanyAdmin");
      case "HR_MANAGER":
        return t("super.roleHr");
      case "APPROVER":
        return t("super.roleApprover");
      case "EMPLOYEE":
        return t("super.roleEmployee");
      default:
        return r;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const r = await fetch(`/api/super/companies/${id}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) {
      setError(typeof j.error === "string" ? j.error : t("super.addUserFail"));
      return;
    }
    setEmail("");
    setName("");
    setPassword("");
    setRole("EMPLOYEE");
    await load();
  }

  async function saveDisplayName(u: RowUser) {
    if (!u.employee) return;
    const next = nameDraft[u.id]?.trim() ?? "";
    const current = u.employee.name;
    if (!next || next === current) {
      setNameDraft((prev) => ({ ...prev, [u.id]: current }));
      return;
    }

    setNameError(null);
    setSavingNameId(u.id);
    const r = await fetch(`/api/super/companies/${id}/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    const j = await r.json().catch(() => ({}));
    setSavingNameId(null);
    if (!r.ok) {
      setNameError(typeof j.error === "string" ? j.error : t("super.saveNameFail"));
      setNameDraft((prev) => ({ ...prev, [u.id]: current }));
      return;
    }
    setUsers((prev) =>
      prev.map((row) =>
        row.id === u.id ? { ...row, employee: { ...row.employee!, name: j.employee?.name ?? next } } : row
      )
    );
  }

  async function changeRole(u: RowUser, nextRole: (typeof ADD_ROLES)[number]) {
    if (nextRole === u.role) return;
    setRoleError(null);
    setSavingRoleId(u.id);
    const prevRole = u.role;
    // 낙관적 갱신
    setUsers((prev) =>
      prev.map((row) => (row.id === u.id ? { ...row, role: nextRole } : row))
    );
    const r = await fetch(`/api/super/companies/${id}/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    const j = await r.json().catch(() => ({}));
    setSavingRoleId(null);
    if (!r.ok) {
      setRoleError(typeof j.error === "string" ? j.error : t("super.saveRoleFail"));
      // 롤백
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, role: prevRole } : row))
      );
      return;
    }
    if (j.user?.role) {
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, role: j.user.role } : row))
      );
    }
  }

  async function deleteUser(u: RowUser) {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `${u.email}\n\n${t("super.deleteUserConfirm")}`
      );
      if (!ok) return;
    }
    setDeleteError(null);
    setDeletingId(u.id);
    const r = await fetch(`/api/super/companies/${id}/users/${u.id}`, {
      method: "DELETE",
    });
    const j = await r.json().catch(() => ({}));
    setDeletingId(null);
    if (!r.ok) {
      setDeleteError(typeof j.error === "string" ? j.error : t("super.deleteUserFail"));
      return;
    }
    setUsers((prev) => prev.filter((row) => row.id !== u.id));
    setCompany((prev) =>
      prev
        ? {
            ...prev,
            _count: {
              ...prev._count,
              users: Math.max(0, prev._count.users - 1),
              employees: Math.max(0, prev._count.employees - (u.employee ? 1 : 0)),
            },
          }
        : prev
    );
  }

  if (!id) return null;

  if (!company) {
    return (
      <div className={pageStackDetailLg}>
        <Link href="/super" className={linkBackLg}>
          ← {t("super.backToCompanies")}
        </Link>
        <p className="text-[1rem] text-[var(--apple-label-secondary)] sm:text-[1.0625rem]">
          {notFound ? t("super.companyNotFound") : loadError ?? t("super.addUserFail")}
        </p>
      </div>
    );
  }

  const seatMeta = `${t("super.usersSeatUsage")}: ${company._count.employees} / ${company.seatLimit}`;

  return (
    <div className={pageStackDetailLg}>
      <PageHeader
        size="lg"
        title={company.name}
        subtitle={t("super.companyUsersSubtitle")}
        meta={seatMeta}
        actions={
          <Link href="/super" className={linkBackLg}>
            ← {t("super.backToCompanies")}
          </Link>
        }
      />

      <div
        role="tablist"
        aria-label={t("super.companyUsersTitle")}
        className="flex w-full gap-1 overflow-x-auto rounded-xl bg-[var(--fill-secondary)] p-1 sm:w-auto sm:self-start sm:overflow-visible"
      >
        {(["users", "dashboard", "stats"] as const).map((tabKey) => {
          const labelKey =
            tabKey === "users"
              ? "super.tabUsers"
              : tabKey === "dashboard"
                ? "super.tabDashboard"
                : "super.tabStats";
          const active = tab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabKey)}
              className={
                active
                  ? "min-h-[2.25rem] flex-1 whitespace-nowrap rounded-lg bg-[var(--background)] px-4 text-[0.9375rem] font-semibold text-[var(--foreground)] shadow-sm sm:flex-none"
                  : "min-h-[2.25rem] flex-1 whitespace-nowrap rounded-lg px-4 text-[0.9375rem] font-medium text-[var(--apple-label-secondary)] hover:text-[var(--foreground)] sm:flex-none"
              }
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && (
        <div className="space-y-8">
          <AdminTodayOverview companyId={id} hideViewAllLink />
          <MonthlyAttendanceOverview companyId={id} hideViewAllLink />
          <AdminCompanySettings companyId={id} />
        </div>
      )}

      {tab === "stats" && <SuperCompanyAttendanceStats companyId={id} />}

      {tab === "users" && (
      <>
      <section>
        <p className={sectionLabelLg}>{t("super.addUserSection")}</p>
        <div className={groupedCardLg}>
          <div className={cardBodyLg}>
            <form onSubmit={(e) => void onSubmit(e)} className={formGridLg}>
              <div className={formGridFull}>
                <label className={labelLg}>{t("super.addEmail")}</label>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  className={`${inputLg} mt-1.5`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={labelLg}>{t("super.addName")}</label>
                <input
                  required
                  className={`${inputLg} mt-1.5`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={labelLg}>{t("super.addRole")}</label>
                <select
                  className={`${selectLg} mt-1.5`}
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof ADD_ROLES)[number])}
                >
                  {ADD_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={formGridFull}>
                <label className={labelLg}>{t("super.addPassword")}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={`${inputLg} mt-1.5`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p className={`${formGridFull} ${errorText}`}>
                  {error}
                </p>
              )}
              <div className={formGridFull}>
                <button
                  type="submit"
                  disabled={loading}
                  className={`${btnPrimaryLg} w-full sm:w-auto`}
                >
                  {loading ? t("common.processing") : t("super.addButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section>
        <p className={sectionLabelLg}>{t("super.userListTitle")}</p>
        {nameError && <p className={`mb-3 ${errorText}`}>{nameError}</p>}
        {roleError && <p className={`mb-3 ${errorText}`}>{roleError}</p>}
        {deleteError && <p className={`mb-3 ${errorText}`}>{deleteError}</p>}
        <div className={tableWrapLg}>
          <table className={tableLg}>
            <thead className={tableHeadLg}>
              <tr>
                <th className={`${thLg} w-[32%]`}>{t("super.listEmail")}</th>
                <th className={`${thLg} w-[20%]`}>{t("super.listName")}</th>
                <th className={`${thLg} w-[18%]`}>{t("super.listRole")}</th>
                <th className={`${thLg} w-[14%]`}>{t("super.listConsent")}</th>
                <th className={`${thLg} w-[16%] text-right`}>
                  {t("super.listActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr className={tableRow}>
                  <td colSpan={5} className={emptyStateLg}>
                    {t("common.noData")}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className={tableRow}>
                    <td className={tdEmailLg}>
                      <span className="block truncate" title={u.email}>
                        {u.email}
                      </span>
                    </td>
                    <td className={tdNameLg}>
                      {u.employee ? (
                        <input
                          className={inputTableLabelLg}
                          value={nameDraft[u.id] ?? u.employee.name}
                          disabled={savingNameId === u.id}
                          aria-label={t("super.listName")}
                          onChange={(e) =>
                            setNameDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                          onBlur={() => void saveDisplayName(u)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                            if (e.key === "Escape") {
                              setNameDraft((prev) => ({
                                ...prev,
                                [u.id]: u.employee?.name ?? "",
                              }));
                              e.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={tdStatusLg}>
                      <label className="sr-only" htmlFor={`super-user-role-${u.id}`}>
                        {t("super.listRole")}
                      </label>
                      <select
                        id={`super-user-role-${u.id}`}
                        className={`${selectLg} !py-1.5 text-[0.8125rem]`}
                        value={u.role}
                        onChange={(e) =>
                          void changeRole(
                            u,
                            e.target.value as (typeof ADD_ROLES)[number]
                          )
                        }
                        disabled={savingRoleId === u.id}
                        aria-busy={savingRoleId === u.id}
                      >
                        {ADD_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={tdStatusLg}>
                      <span className={statusBadge(u.consentGivenAt ? "APPROVED" : "PENDING")}>
                        {u.consentGivenAt ? t("super.consentDone") : t("super.consentPending")}
                      </span>
                    </td>
                    <td className={`${tdStatusLg} text-right`}>
                      <button
                        type="button"
                        className={btnDestructive}
                        disabled={deletingId === u.id}
                        onClick={() => void deleteUser(u)}
                        aria-label={`${t("super.deleteUserButton")} — ${u.email}`}
                      >
                        {deletingId === u.id
                          ? t("common.processing")
                          : t("super.deleteUserButton")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
