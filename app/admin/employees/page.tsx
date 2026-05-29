"use client";

import { EmployeeBulkImportPanel } from "@/components/admin/EmployeeBulkImportPanel";
import {
  DepartmentManagerModal,
  type Department,
} from "@/components/admin/DepartmentManagerModal";
import { EmployeeListTable } from "@/components/admin/EmployeeListTable";
import { EmployeeWorkScheduleBulkBar } from "@/components/admin/EmployeeWorkScheduleBulkBar";
import {
  EmployeeWorkScheduleModal,
  type EmployeeScheduleTarget,
} from "@/components/admin/EmployeeWorkScheduleModal";
import { employeeScheduleSummary } from "@/lib/employeeWorkSchedule";
import {
  DEFAULT_SHIFT_PRESETS,
  localizeShiftPresetsMap,
  type ShiftLocale,
  type ShiftPresetsMap,
} from "@/lib/shiftPresets";
import { useI18n } from "@/components/LanguageProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  bannerWarning,
  btnPrimary,
  btnSecondary,
  card,
  cardBody,
  errorText,
  emptyStateCompact,
  hint,
  input,
  label,
  link,
  pageStack,
  searchFieldCol,
  searchFieldWrap,
  searchFiltersRow,
  sectionLabel,
  select,
  tableToolbar,
  tableWrap,
} from "@/lib/uiStyles";
import {
  assignableRolesForCaller,
  canDeleteEmployee,
} from "@/lib/roleHierarchy";
import type { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Emp = {
  id: string;
  name: string;
  user: { id: string; email: string; role: string };
  department: { id: string; name: string } | null;
  workScheduleType?: string | null;
  shiftCode?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  scheduleSummary?: string;
};

const profileEditRoles = new Set<Role>(["COMPANY_ADMIN", "HR_MANAGER", "SUPER_ADMIN"]);

export default function AdminEmployeesPage() {
  const { t, locale } = useI18n();
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
  const [passwordEditId, setPasswordEditId] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [shiftPresets, setShiftPresets] = useState<ShiftPresetsMap>(DEFAULT_SHIFT_PRESETS);
  const [companyDefault, setCompanyDefault] = useState({
    workStartTime: "09:00",
    workEndTime: "18:00",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scheduleModalEmp, setScheduleModalEmp] = useState<EmployeeScheduleTarget | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilterId, setDepartmentFilterId] = useState("");

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
        const rows = Array.isArray(ej.employees) ? (ej.employees as Emp[]) : [];
        const cs = ej.companySchedule as {
          workStartTime?: string | null;
          workEndTime?: string | null;
          workDays?: string | null;
          workScheduleByDay?: unknown;
          shiftPresets?: unknown;
        } | undefined;
        const companySchedule = {
          workStartTime: cs?.workStartTime ?? "09:00",
          workEndTime: cs?.workEndTime ?? "18:00",
          workDays: cs?.workDays ?? null,
          workScheduleByDay: cs?.workScheduleByDay,
          shiftPresets: cs?.shiftPresets,
        };
        setCompanyDefault({
          workStartTime: companySchedule.workStartTime ?? "09:00",
          workEndTime: companySchedule.workEndTime ?? "18:00",
        });
        const loc: ShiftLocale = locale === "en" ? "en" : "ko";
        setShiftPresets(
          localizeShiftPresetsMap(
            (ej.shiftPresets as ShiftPresetsMap | undefined) ?? DEFAULT_SHIFT_PRESETS,
            loc
          )
        );
        setEmployees(
          rows.map((e) => ({
            ...e,
            scheduleSummary: employeeScheduleSummary(e, companySchedule, loc).label,
          }))
        );
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
  }, [locale]);

  useEffect(() => {
    const loc: ShiftLocale = locale === "en" ? "en" : "ko";
    setShiftPresets((prev) => localizeShiftPresetsMap(prev, loc));
  }, [locale]);

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

  const canEditProfile = callerRole != null && profileEditRoles.has(callerRole);
  const canBulkAdd =
    callerRole === "COMPANY_ADMIN" || callerRole === "HR_MANAGER";

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((e) => {
      if (departmentFilterId === "__none__") {
        if (e.department) return false;
      } else if (departmentFilterId && e.department?.id !== departmentFilterId) {
        return false;
      }
      if (!q) return true;
      const haystack = [e.name, e.user.email, e.department?.name ?? "", e.scheduleSummary ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, searchQuery, departmentFilterId]);

  useEffect(() => {
    const visible = new Set(filteredEmployees.map((e) => e.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredEmployees]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const ids = filteredEmployees.map((e) => e.id);
    setSelectedIds((prev) => {
      const allVisibleSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  async function bulkApplySchedule(payload: {
    workScheduleType: "COMPANY" | "SHIFT" | "CUSTOM";
    shiftCode?: "A" | "B" | "C";
    workStartTime?: string;
    workEndTime?: string;
  }): Promise<boolean> {
    const ids = [...selectedIds];
    if (ids.length === 0) return false;
    const r = await fetch("/api/admin/employees/work-schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeIds: ids, ...payload }),
    });
    if (!r.ok) return false;
    setSelectedIds(new Set());
    await loadEmployees();
    return true;
  }

  function openScheduleModal(emp: Emp) {
    setScheduleModalEmp(emp);
    setScheduleModalOpen(true);
  }

  async function patchEmployee(
    empId: string,
    body: Record<string, unknown>,
    opts?: {
      optimistic?: (prev: Emp[]) => Emp[];
      revert?: () => void;
    }
  ): Promise<boolean> {
    setRowBusyId(empId);
    setRowError(null);
    if (opts?.optimistic) setEmployees(opts.optimistic);
    try {
      const r = await fetch(`/api/admin/employees/${encodeURIComponent(empId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          j.error === "EMAIL_TAKEN"
            ? t("admin.employeesEmailTaken")
            : typeof j.message === "string"
              ? j.message
              : typeof j.error === "string"
                ? j.error
                : t("admin.employeesProfileSaveFail");
        setRowError(msg);
        opts?.revert?.();
        return false;
      }
      const updated = j.employee as Emp | undefined;
      if (updated) {
        setEmployees((prev) => prev.map((x) => (x.id === empId ? updated : x)));
      } else {
        await loadEmployees();
      }
      return true;
    } catch (err) {
      console.error("[employees patch]", err);
      setRowError(t("admin.employeesProfileSaveFail"));
      opts?.revert?.();
      return false;
    } finally {
      setRowBusyId(null);
    }
  }

  async function saveName(emp: Emp, raw: string) {
    const next = raw.trim();
    if (!next || next === emp.name) return;
    const prev = emp.name;
    await patchEmployee(
      emp.id,
      { name: next },
      {
        optimistic: (list) =>
          list.map((x) => (x.id === emp.id ? { ...x, name: next } : x)),
        revert: () =>
          setEmployees((list) =>
            list.map((x) => (x.id === emp.id ? { ...x, name: prev } : x))
          ),
      }
    );
  }

  async function saveEmail(emp: Emp, raw: string) {
    const next = raw.trim().toLowerCase();
    if (!next || next === emp.user.email.toLowerCase()) return;
    const prev = emp.user.email;
    await patchEmployee(
      emp.id,
      { email: next },
      {
        optimistic: (list) =>
          list.map((x) =>
            x.id === emp.id ? { ...x, user: { ...x.user, email: next } } : x
          ),
        revert: () =>
          setEmployees((list) =>
            list.map((x) =>
              x.id === emp.id ? { ...x, user: { ...x.user, email: prev } } : x
            )
          ),
      }
    );
  }

  async function savePassword(empId: string): Promise<boolean> {
    const pwd = passwordDraft.trim();
    if (pwd.length < 8) {
      setRowError(t("admin.employeesPasswordHint"));
      return false;
    }
    const ok = await patchEmployee(empId, { password: pwd });
    if (ok) {
      setPasswordEditId(null);
      setPasswordDraft("");
    }
    return ok;
  }

  async function finishPasswordEdit(empId: string) {
    if (passwordEditId !== empId) return;
    const pwd = passwordDraft.trim();
    if (pwd.length === 0) {
      setPasswordEditId(null);
      setPasswordDraft("");
      return;
    }
    if (pwd.length < 8) {
      setRowError(t("admin.employeesPasswordHint"));
      return;
    }
    await savePassword(empId);
  }

  function deleteDisabledReason(emp: Emp, isSelf: boolean): string | undefined {
    if (isSelf) return t("admin.employeesCannotDeleteSelf");
    if (!canDeleteEmployee(callerRole, emp.user.role, isSelf)) {
      return t("admin.employeesDeleteNotAllowed");
    }
    return undefined;
  }

  async function deleteEmployee(emp: Emp) {
    const ok = window.confirm(
      t("admin.employeesDeleteConfirm").replace("{name}", emp.name)
    );
    if (!ok) return;
    setRowBusyId(emp.id);
    setRowError(null);
    if (passwordEditId === emp.id) {
      setPasswordEditId(null);
      setPasswordDraft("");
    }
    try {
      const r = await fetch(`/api/admin/employees/${encodeURIComponent(emp.id)}`, {
        method: "DELETE",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          j.error === "CANNOT_DELETE_SELF"
            ? t("admin.employeesCannotDeleteSelf")
            : j.error === "LAST_ADMIN"
              ? t("admin.employeesLastAdmin")
              : j.error === "ROLE_NOT_ALLOWED"
                ? t("admin.employeesDeleteNotAllowed")
                : typeof j.message === "string"
                  ? j.message
                  : t("admin.employeesDeleteFail");
        setRowError(msg);
        return;
      }
      setEmployees((prev) => prev.filter((x) => x.id !== emp.id));
      await loadEmployees();
    } catch (err) {
      console.error("[employees delete]", err);
      setRowError(t("admin.employeesDeleteFail"));
    } finally {
      setRowBusyId(null);
    }
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
            <form
              onSubmit={(e) => void addEmployee(e)}
              className="grid w-full grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-3"
            >
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
              <div className={canEditRoles ? undefined : "sm:col-span-2"}>
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
              ) : null}
              <div>
                <span className={`${label} invisible`} aria-hidden>
                  {t("admin.employeesAddButton")}
                </span>
                <button
                  type="submit"
                  className={`${btnPrimary} mt-1.5 w-full`}
                  disabled={noDepartments}
                >
                  {t("admin.employeesAddButton")}
                </button>
              </div>
              {error && <p className={`${errorText} sm:col-span-3`}>{error}</p>}
            </form>
          </div>
        </div>
        {canBulkAdd && !noDepartments && (
          <EmployeeBulkImportPanel onImported={() => void loadAll()} />
        )}
      </section>

      <section>
        <p className={sectionLabel}>{t("admin.employeesListTitle")}</p>
        {canEditProfile && (
          <EmployeeWorkScheduleBulkBar
            selectedCount={selectedIds.size}
            shiftPresets={shiftPresets}
            companyDefault={companyDefault}
            onApply={bulkApplySchedule}
            onClearSelection={() => setSelectedIds(new Set())}
          />
        )}
        {rowError && <p className={`mb-3 ${errorText}`}>{rowError}</p>}

        <div className={tableWrap}>
          <div className={tableToolbar}>
            <div className={`${searchFiltersRow} w-full`}>
              <div className={`${searchFieldCol} ${searchFieldWrap}`}>
                <label className={label} htmlFor="employees-search">
                  {t("admin.employeesSearchLabel")}
                </label>
                <input
                  id="employees-search"
                  type="search"
                  className={input}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("admin.employeesSearchPlaceholder")}
                  autoComplete="off"
                />
              </div>
              <div className={`${searchFieldCol} min-w-[10rem] sm:min-w-[12rem]`}>
                <label className={label} htmlFor="employees-dept-filter">
                  {t("admin.employeesDepartmentFilter")}
                </label>
                <select
                  id="employees-dept-filter"
                  className={select}
                  value={departmentFilterId}
                  onChange={(e) => setDepartmentFilterId(e.target.value)}
                >
                  <option value="">{t("admin.employeesDepartmentAll")}</option>
                  <option value="__none__">{t("admin.employeesDepartmentUnassigned")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {(searchQuery.trim() || departmentFilterId) && (
                <button
                  type="button"
                  className={`${btnSecondary} self-end`}
                  onClick={() => {
                    setSearchQuery("");
                    setDepartmentFilterId("");
                  }}
                >
                  {t("admin.employeesSearchClear")}
                </button>
              )}
            </div>
            {employees.length > 0 && (
              <p className={`mt-3 text-[0.8125rem] ${hint}`}>
                {t("admin.employeesSearchResultCount")
                  .replace("{shown}", String(filteredEmployees.length))
                  .replace("{total}", String(employees.length))}
              </p>
            )}
          </div>

          {employees.length === 0 ? (
            <p className={`px-5 py-8 sm:px-6 ${emptyStateCompact}`}>{t("admin.employeesEmpty")}</p>
          ) : filteredEmployees.length === 0 ? (
            <p className={`px-5 py-8 sm:px-6 ${emptyStateCompact}`}>
              {t("admin.employeesSearchNoResults")}
            </p>
          ) : (
            <EmployeeListTable
            employees={filteredEmployees}
            departments={departments}
            canEditProfile={canEditProfile}
            canEditRoles={canEditRoles}
            callerRole={callerRole}
            callerUserId={callerUserId}
            assignableRoles={assignableRoles}
            rowBusyId={rowBusyId}
            passwordEditId={passwordEditId}
            passwordDraft={passwordDraft}
            onPasswordDraftChange={setPasswordDraft}
            onPasswordEditStart={(empId) => {
              setPasswordEditId(empId);
              setPasswordDraft("");
              setRowError(null);
            }}
            onPasswordEditFinish={(empId) => void finishPasswordEdit(empId)}
            onPasswordEditCancel={() => {
              setPasswordEditId(null);
              setPasswordDraft("");
            }}
            onSaveName={(emp, value) => void saveName(emp, value)}
            onSaveEmail={(emp, value) => void saveEmail(emp, value)}
            onChangeRole={(emp, role) => void changeRole(emp, role)}
            onChangeDepartment={(empId, deptId) => void changeDepartment(empId, deptId)}
            onDelete={(emp) => void deleteEmployee(emp)}
            deleteDisabledReason={deleteDisabledReason}
            roleLabel={roleLabel}
            canEditSchedule={canEditProfile}
            onEditSchedule={openScheduleModal}
            selectedIds={canEditProfile ? selectedIds : undefined}
            onToggleSelect={canEditProfile ? toggleSelect : undefined}
            onToggleSelectAll={canEditProfile ? toggleSelectAll : undefined}
          />
          )}
        </div>
      </section>

      <EmployeeWorkScheduleModal
        open={scheduleModalOpen}
        employee={scheduleModalEmp}
        shiftPresets={shiftPresets}
        companyDefault={companyDefault}
        onClose={() => {
          setScheduleModalOpen(false);
          setScheduleModalEmp(null);
        }}
        onSaved={() => void loadEmployees()}
      />

      <DepartmentManagerModal
        open={deptModalOpen}
        onClose={() => setDeptModalOpen(false)}
        onChanged={() => void loadAll()}
      />
    </div>
  );
}
