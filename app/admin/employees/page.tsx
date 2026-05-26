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
  groupedRow,
  hint,
  input,
  label,
  link,
  pageStack,
  sectionLabel,
  select,
} from "@/lib/uiStyles";
import { useCallback, useEffect, useState } from "react";

type Emp = {
  id: string;
  name: string;
  user: { email: string; role: string };
  department: { id: string; name: string } | null;
};

export default function AdminEmployeesPage() {
  const { t } = useI18n();
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [seatInfo, setSeatInfo] = useState<{ used: number; limit: number } | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

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
    await loadAll();
  }

  async function changeDepartment(empId: string, nextDeptId: string) {
    setRowBusyId(empId);
    try {
      const r = await fetch(`/api/admin/employees/${encodeURIComponent(empId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: nextDeptId || null }),
      });
      if (!r.ok) {
        // 실패 시 서버 상태로 롤백
        await loadEmployees();
        return;
      }
      const j = await r.json().catch(() => ({}));
      const updated = j.employee as Emp | undefined;
      if (updated) {
        setEmployees((prev) => prev.map((x) => (x.id === empId ? { ...x, department: updated.department } : x)));
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

  const seatLine = seatInfo
    ? t("admin.employeesSeatLine")
        .replace("{used}", String(seatInfo.used))
        .replace("{limit}", String(seatInfo.limit))
    : undefined;

  const noDepartments = departments.length === 0;

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
            <form onSubmit={(e) => void addEmployee(e)} className="grid max-w-lg gap-4">
              <div>
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
                />
                <p className={`mt-1.5 ${hint}`}>{t("admin.employeesPasswordHint")}</p>
              </div>
              {error && <p className={errorText}>{error}</p>}
              <button
                type="submit"
                className={`${btnPrimary} w-full sm:w-auto`}
                disabled={noDepartments}
              >
                {t("admin.employeesAddButton")}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section>
        <p className={sectionLabel}>{t("admin.employeesListTitle")}</p>
        <ul className={groupedCard}>
          {employees.length === 0 ? (
            <li className={emptyStateCompact}>{t("admin.employeesEmpty")}</li>
          ) : (
            employees.map((e, i) => (
              <li
                key={e.id}
                className={`${groupedRow} ${i < employees.length - 1 ? "border-b border-[var(--separator)]" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--foreground)]">{e.name}</p>
                    <p className="mt-0.5 text-[0.875rem] text-[var(--apple-label-secondary)]">
                      {e.user.email} · {e.user.role}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <label className="sr-only" htmlFor={`emp-dept-${e.id}`}>
                      {t("admin.employeesDepartmentLabel")}
                    </label>
                    <select
                      id={`emp-dept-${e.id}`}
                      className={`${select} min-w-[8rem] !py-1.5 !pr-9 text-[0.8125rem]`}
                      value={e.department?.id ?? ""}
                      onChange={(ev) => void changeDepartment(e.id, ev.target.value)}
                      disabled={rowBusyId === e.id}
                      aria-busy={rowBusyId === e.id}
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
            ))
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
