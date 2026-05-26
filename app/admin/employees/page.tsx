"use client";

import {
  DepartmentManagerModal,
  type Department,
} from "@/components/admin/DepartmentManagerModal";
import { useI18n } from "@/components/LanguageProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  bannerWarning,
  btnPrimary,
  btnSecondary,
  card,
  cardBody,
  emptyStateCompact,
  errorText,
  groupedCard,
  input,
  label,
  link,
  pageStack,
  sectionLabel,
  select,
} from "@/lib/uiStyles";
import { assignableRolesForCaller, canAssignRole } from "@/lib/roleHierarchy";
import type { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Emp = {
  id: string;
  name: string;
  user: { id: string; email: string; role: string };
  department: { id: string; name: string } | null;
};

/** 행 우측 컨트롤 — 드롭다운/정적 라벨 모두 동일한 칩 모양으로 렌더 */
const rowControl =
  "h-8 w-full rounded-[0.5rem] bg-[var(--fill-secondary)] px-2.5 pr-8 text-[0.8125rem] leading-none text-[var(--foreground)] outline-none transition-[box-shadow,background-color] focus:ring-2 focus:ring-[var(--apple-blue)]/25 disabled:opacity-60";
const rowControlStatic =
  "flex h-8 w-full items-center rounded-[0.5rem] bg-[var(--fill-tertiary)] px-2.5 text-[0.8125rem] text-[var(--apple-label-secondary)]";

export default function AdminEmployeesPage() {
  const { t } = useI18n();
  const { data: sessionData } = useSession();
  const callerRole = (sessionData?.user?.role ?? null) as Role | null;
  const callerUserId = sessionData?.user?.id ?? null;

  const [employees, setEmployees] = useState<Emp[]>([]);
  const [seatInfo, setSeatInfo] = useState<{ used: number; limit: number } | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [newRole, setNewRole] = useState<Role>("EMPLOYEE");
  const [error, setError] = useState<string | null>(null);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const assignableRoles = useMemo(
    () => assignableRolesForCaller(callerRole),
    [callerRole]
  );

  const loadEmployees = useCallback(async () => {
    try {
      const [er, br] = await Promise.all([
        fetch("/api/admin/employees"),
        fetch("/api/admin/billing"),
      ]);
      const ej = await er.json().catch(() => ({}));
      const bj = await br.json().catch(() => ({}));
      if (er.ok) {
        setEmployees(Array.isArray(ej.employees) ? ej.employees : []);
        setError(null);
      } else if (typeof ej?.error === "string") {
        setError(ej.error);
      }
      if (br.ok) {
        setSeatInfo({ used: bj.employeeCount ?? 0, limit: bj.company?.seatLimit ?? 0 });
      }
    } catch (e) {
      console.error("[employees load]", e);
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/departments");
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      setDepartments(Array.isArray(j.departments) ? j.departments : []);
    } catch (e) {
      console.error("[departments load]", e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadEmployees(), loadDepartments()]);
  }, [loadEmployees, loadDepartments]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function roleLabel(r: string) {
    switch (r) {
      case "COMPANY_ADMIN":
        return t("common.roleCompanyAdmin");
      case "HR_MANAGER":
        return t("common.roleHrManager");
      case "APPROVER":
        return t("common.roleApprover");
      case "EMPLOYEE":
        return t("common.roleEmployee");
      default:
        return r;
    }
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!departmentId) {
      setError(t("admin.employeesDepartmentRequired"));
      return;
    }
    const r = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        password,
        departmentId,
        role: newRole,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(typeof j.error === "string" ? j.error : t("admin.employeesAddFail"));
      return;
    }
    setEmail("");
    setName("");
    setPassword("");
    setDepartmentId("");
    setNewRole("EMPLOYEE");
    await loadAll();
  }

  async function changeDepartment(empId: string, nextDeptId: string) {
    setRowBusyId(empId);
    setRowError(null);
    try {
      const r = await fetch(`/api/admin/employees/${encodeURIComponent(empId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: nextDeptId || null }),
      });
      if (!r.ok) {
        await loadEmployees();
        return;
      }
      const j = await r.json().catch(() => ({}));
      const updated = j.employee as Emp | undefined;
      if (updated) {
        setEmployees((prev) =>
          prev.map((x) => (x.id === empId ? { ...x, department: updated.department } : x))
        );
      } else {
        await loadEmployees();
      }
    } catch (err) {
      console.error("[employees patch]", err);
      await loadEmployees();
    } finally {
      setRowBusyId(null);
    }
  }

  async function changeRole(emp: Emp, nextRole: Role) {
    if (nextRole === emp.user.role) return;
    setRowBusyId(emp.id);
    setRowError(null);
    const prevRole = emp.user.role;
    setEmployees((prev) =>
      prev.map((x) => (x.id === emp.id ? { ...x, user: { ...x.user, role: nextRole } } : x))
    );
    try {
      const r = await fetch(`/api/admin/employees/${encodeURIComponent(emp.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRowError(
          typeof j.message === "string"
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : t("admin.employeesRoleSaveFail")
        );
        setEmployees((prev) =>
          prev.map((x) => (x.id === emp.id ? { ...x, user: { ...x.user, role: prevRole } } : x))
        );
        return;
      }
      const updated = j.employee as Emp | undefined;
      if (updated?.user?.role) {
        setEmployees((prev) =>
          prev.map((x) =>
            x.id === emp.id ? { ...x, user: { ...x.user, role: updated.user.role } } : x
          )
        );
      }
    } catch (err) {
      console.error("[employees role patch]", err);
      setEmployees((prev) =>
        prev.map((x) => (x.id === emp.id ? { ...x, user: { ...x.user, role: prevRole } } : x))
      );
    } finally {
      setRowBusyId(null);
    }
  }

  const seatLine = seatInfo
    ? t("admin.employeesSeatLine")
        .replace("{used}", String(seatInfo.used))
        .replace("{limit}", String(seatInfo.limit))
    : undefined;

  const noDepartments = departments.length === 0;
  const canEditRoles = assignableRoles.length > 0;

  return (
    <div className={pageStack}>
      <PageHeader
        title={t("admin.employeesTitle")}
        subtitle={seatLine}
        actions={
          seatInfo ? (
            <a href="/admin/billing" className={link}>
              {t("admin.employeesUpgradeLink")}
            </a>
          ) : undefined
        }
      />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className={`${sectionLabel} mb-0`}>{t("admin.employeesAddTitle")}</p>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => setDeptModalOpen(true)}
          >
            {t("admin.employeesDepartmentManage")}
          </button>
        </div>
        <div className={card}>
          <div className={cardBody}>
            {noDepartments && (
              <p className={`${bannerWarning} mb-4`}>{t("admin.employeesNoDepartmentsYet")}</p>
            )}
            <form onSubmit={(e) => void addEmployee(e)} className="grid max-w-xl gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label}>
                  {t("admin.employeesEmailLabel")}{" "}
                  <span aria-hidden className="text-[var(--apple-red)]">*</span>
                </label>
                <input
                  required
                  type="email"
                  className={`${input} mt-1.5`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>
                  {t("admin.employeesNameLabel")}{" "}
                  <span aria-hidden className="text-[var(--apple-red)]">*</span>
                </label>
                <input
                  required
                  className={`${input} mt-1.5`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>
                  {t("admin.employeesPasswordLabel")}{" "}
                  <span aria-hidden className="text-[var(--apple-red)]">*</span>
                </label>
                <input
                  required
                  type="password"
                  minLength={8}
                  className={`${input} mt-1.5`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("admin.employeesPasswordHint")}
                />
              </div>
              <div>
                <label className={label}>
                  {t("admin.employeesDepartmentLabel")}{" "}
                  <span aria-hidden className="text-[var(--apple-red)]">*</span>
                </label>
                <select
                  required
                  className={`${select} mt-1.5`}
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  disabled={noDepartments}
                >
                  <option value="" disabled>
                    {t("admin.employeesDepartmentSelect")}
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {canEditRoles ? (
                <div>
                  <label className={label}>{t("admin.employeesRoleLabel")}</label>
                  <select
                    className={`${select} mt-1.5`}
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as Role)}
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="hidden sm:block" aria-hidden />
              )}
              {error && <p className={`${errorText} sm:col-span-2`}>{error}</p>}
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className={`${btnPrimary} w-full sm:w-auto`}
                  disabled={noDepartments}
                >
                  {t("admin.employeesAddButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section>
        <p className={sectionLabel}>{t("admin.employeesListTitle")}</p>
        {rowError && <p className={`mb-3 ${errorText}`}>{rowError}</p>}
        <ul className={groupedCard}>
          {employees.length === 0 ? (
            <li className={emptyStateCompact}>{t("admin.employeesEmpty")}</li>
          ) : (
            employees.map((e, i) => {
              const isSelf = callerUserId != null && e.user.id === callerUserId;
              const canEditThisRole =
                canEditRoles &&
                !isSelf &&
                assignableRoles.some((r) => canAssignRole(callerRole, e.user.role, r));
              const isBusy = rowBusyId === e.id;
              return (
                <li
                  key={e.id}
                  className={`px-5 py-2 text-[0.9375rem] leading-snug text-[var(--foreground)] sm:px-6 ${i < employees.length - 1 ? "border-b border-[var(--separator)]" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:flex-nowrap">
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-y-0.5 sm:flex-nowrap">
                      <p className="truncate font-medium text-[var(--foreground)] sm:w-[10rem] sm:shrink-0 md:w-[12rem]">
                        {e.name}
                      </p>
                      <p className="truncate text-[0.8125rem] text-[var(--apple-label-secondary)]">
                        {e.user.email}
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:shrink-0 sm:grid-cols-[10rem_10rem]">
                      {canEditThisRole ? (
                        <>
                          <label className="sr-only" htmlFor={`emp-role-${e.id}`}>
                            {t("admin.employeesRoleLabel")}
                          </label>
                          <select
                            id={`emp-role-${e.id}`}
                            className={`auth-select-field ${rowControl}`}
                            value={e.user.role}
                            onChange={(ev) => void changeRole(e, ev.target.value as Role)}
                            disabled={isBusy}
                            aria-busy={isBusy}
                          >
                            {[
                              e.user.role as Role,
                              ...assignableRoles.filter((r) => r !== e.user.role),
                            ].map((r) => (
                              <option
                                key={r}
                                value={r}
                                disabled={!canAssignRole(callerRole, e.user.role, r) && r !== e.user.role}
                              >
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <span
                          className={rowControlStatic}
                          title={t("admin.employeesRoleLabel")}
                          aria-label={t("admin.employeesRoleLabel")}
                        >
                          {roleLabel(e.user.role)}
                        </span>
                      )}
                      <label className="sr-only" htmlFor={`emp-dept-${e.id}`}>
                        {t("admin.employeesDepartmentLabel")}
                      </label>
                      <select
                        id={`emp-dept-${e.id}`}
                        className={`auth-select-field ${rowControl}`}
                        value={e.department?.id ?? ""}
                        onChange={(ev) => void changeDepartment(e.id, ev.target.value)}
                        disabled={isBusy}
                        aria-busy={isBusy}
                      >
                        <option value="">{t("admin.employeesDepartmentNone")}</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <DepartmentManagerModal
        open={deptModalOpen}
        onClose={() => setDeptModalOpen(false)}
        onChanged={() => void loadAll()}
      />
    </div>
  );
}
