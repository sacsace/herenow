"use client";

import type { Department } from "@/components/admin/DepartmentManagerModal";
import { useI18n } from "@/components/LanguageProvider";
import { canAssignRole, canDeleteEmployee } from "@/lib/roleHierarchy";
import { btnDanger, emptyStateCompact, table, tableHead, tableWrap, td, th, trDivider } from "@/lib/uiStyles";
import type { Role } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type EmployeeRow = {
  id: string;
  name: string;
  user: { id: string; email: string; role: string };
  department: { id: string; name: string } | null;
  scheduleSummary?: string;
  workScheduleType?: string | null;
  shiftCode?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
};

const rowControl =
  "h-8 w-full rounded-[0.5rem] bg-[var(--fill-secondary)] px-2.5 pr-8 text-[0.8125rem] leading-none text-[var(--foreground)] outline-none transition-[box-shadow,background-color] focus:ring-2 focus:ring-[var(--apple-blue)]/25 disabled:opacity-60";
const rowControlStatic =
  "flex h-8 w-full items-center rounded-[0.5rem] bg-[var(--fill-tertiary)] px-2.5 text-[0.8125rem] text-[var(--apple-label-secondary)]";
const rowInput =
  "h-8 w-full min-w-0 rounded-[0.5rem] bg-[var(--fill-secondary)] px-2.5 text-[0.8125rem] leading-none text-[var(--foreground)] outline-none transition-[box-shadow,background-color] focus:ring-2 focus:ring-[var(--apple-blue)]/25 disabled:opacity-60";
const rowPasswordMask =
  "flex h-8 w-full min-w-0 items-center rounded-[0.5rem] bg-[var(--fill-secondary)] px-2.5 text-[0.8125rem] tracking-[0.2em] text-[var(--apple-label-secondary)] outline-none transition-[box-shadow,background-color] hover:bg-[var(--fill-secondary-hover)] focus:ring-2 focus:ring-[var(--apple-blue)]/25 disabled:cursor-default disabled:opacity-60";

const WIDTH_STORAGE_KEY = "heresnow_employee_col_widths";

type ResizableCol = "name" | "email" | "password" | "role" | "department";
type SortKey = ResizableCol;
type SortDir = "asc" | "desc";

type ColWidths = Record<ResizableCol, number> & { actions: number };

const DEFAULT_WIDTHS: ColWidths = {
  name: 208,
  email: 200,
  password: 126,
  role: 140,
  department: 152,
  actions: 76,
};

const MIN_WIDTHS: ColWidths = {
  name: 96,
  email: 120,
  password: 88,
  role: 100,
  department: 100,
  actions: 64,
};

const ROLE_ORDER: Role[] = ["EMPLOYEE", "APPROVER", "HR_MANAGER", "COMPANY_ADMIN"];

function loadStoredWidths(): ColWidths {
  if (typeof window === "undefined") return DEFAULT_WIDTHS;
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<ColWidths>;
    const next = { ...DEFAULT_WIDTHS };
    for (const key of Object.keys(DEFAULT_WIDTHS) as (keyof ColWidths)[]) {
      const v = parsed[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        next[key] = Math.max(MIN_WIDTHS[key], v);
      }
    }
    return next;
  } catch {
    return DEFAULT_WIDTHS;
  }
}

function compareString(a: string, b: string, locale: string) {
  return a.localeCompare(b, locale);
}

function roleSortIndex(role: string) {
  const i = ROLE_ORDER.indexOf(role as Role);
  return i < 0 ? 99 : i;
}

type Props = {
  employees: EmployeeRow[];
  departments: Department[];
  canEditProfile: boolean;
  canEditRoles: boolean;
  callerRole: Role | null;
  callerUserId: string | null;
  assignableRoles: Role[];
  rowBusyId: string | null;
  passwordEditId: string | null;
  passwordDraft: string;
  onPasswordDraftChange: (value: string) => void;
  onPasswordEditStart: (empId: string) => void;
  onPasswordEditFinish: (empId: string) => void;
  onPasswordEditCancel: () => void;
  onSaveName: (emp: EmployeeRow, value: string) => void;
  onSaveEmail: (emp: EmployeeRow, value: string) => void;
  onChangeRole: (emp: EmployeeRow, role: Role) => void;
  onChangeDepartment: (empId: string, deptId: string) => void;
  onDelete: (emp: EmployeeRow) => void;
  deleteDisabledReason: (emp: EmployeeRow, isSelf: boolean) => string | undefined;
  roleLabel: (role: string) => string;
  canEditSchedule?: boolean;
  onEditSchedule?: (emp: EmployeeRow) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
};

export function EmployeeListTable({
  employees,
  departments,
  canEditProfile,
  canEditRoles,
  callerRole,
  callerUserId,
  assignableRoles,
  rowBusyId,
  passwordEditId,
  passwordDraft,
  onPasswordDraftChange,
  onPasswordEditStart,
  onPasswordEditFinish,
  onPasswordEditCancel,
  onSaveName,
  onSaveEmail,
  onChangeRole,
  onChangeDepartment,
  onDelete,
  deleteDisabledReason,
  roleLabel,
  canEditSchedule = false,
  onEditSchedule,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const { t, locale } = useI18n();
  const dl = locale === "en" ? "en-US" : "ko-KR";
  const [widths, setWidths] = useState<ColWidths>(DEFAULT_WIDTHS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const resizeRef = useRef<{ col: ResizableCol; startX: number; startW: number } | null>(null);

  useEffect(() => {
    setWidths(loadStoredWidths());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, JSON.stringify(widths));
    } catch {
      /* ignore */
    }
  }, [widths]);

  const sortedEmployees = useMemo(() => {
    const arr = [...employees];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = compareString(a.name, b.name, dl);
          break;
        case "email":
          cmp = compareString(a.user.email, b.user.email, dl);
          break;
        case "role":
          cmp = roleSortIndex(a.user.role) - roleSortIndex(b.user.role);
          break;
        case "department":
          cmp = compareString(a.department?.name ?? "", b.department?.name ?? "", dl);
          break;
        case "password":
          cmp = 0;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [employees, sortKey, sortDir, dl]);

  function toggleSort(key: SortKey) {
    if (key === "password") return;
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "department" ? "asc" : "asc");
    }
  }

  const startResize = useCallback((col: ResizableCol, clientX: number) => {
    resizeRef.current = { col, startX: clientX, startW: widths[col] };
  }, [widths]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setWidths((prev) => ({
        ...prev,
        [r.col]: Math.max(MIN_WIDTHS[r.col], r.startW + delta),
      }));
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const sortArrow = (key: SortKey) => {
    if (key === "password") return null;
    if (sortKey !== key) {
      return (
        <span aria-hidden className="ml-1 text-[var(--apple-label-tertiary)] opacity-50">
          ↕
        </span>
      );
    }
    return (
      <span aria-hidden className="ml-1 text-[var(--apple-blue)]">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const headerCell = (key: SortKey, label: string, resizable: boolean) => (
    <th
      key={key}
      className={`${th} relative select-none`}
      style={{ width: widths[key], minWidth: MIN_WIDTHS[key] }}
      aria-sort={
        key !== "password" && sortKey === key
          ? sortDir === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      {key === "password" ? (
        <span className="block truncate pr-2">{label}</span>
      ) : (
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex max-w-full items-center truncate pr-3 text-inherit hover:text-[var(--foreground)]"
        >
          {label}
          {sortArrow(key)}
        </button>
      )}
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("admin.employeesResizeColumn")}
          className="absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none hover:bg-[var(--apple-blue)]/25 active:bg-[var(--apple-blue)]/40"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(key, e.clientX);
          }}
        />
      )}
    </th>
  );

  if (employees.length === 0) {
    return <p className={emptyStateCompact}>{t("admin.employeesEmpty")}</p>;
  }

  const showSelect = Boolean(onToggleSelect && selectedIds);
  const scheduleColWidth = 168;
  const selectColWidth = 40;
  const tableWidth =
    (showSelect ? selectColWidth : 0) +
    widths.name +
    widths.email +
    widths.password +
    widths.role +
    widths.department +
    scheduleColWidth +
    widths.actions;
  const allSelected =
    showSelect && employees.length > 0 && employees.every((e) => selectedIds!.has(e.id));

  return (
    <div className={tableWrap}>
      <table
        className={table}
        style={{ tableLayout: "fixed", width: "100%", minWidth: tableWidth }}
      >
        <colgroup>
          {showSelect && <col style={{ width: selectColWidth }} />}
          <col style={{ width: widths.name }} />
          <col style={{ width: widths.email }} />
          <col style={{ width: widths.password }} />
          <col style={{ width: widths.role }} />
          <col style={{ width: widths.department }} />
          <col style={{ width: scheduleColWidth }} />
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead className={tableHead}>
          <tr>
            {showSelect && (
              <th className={th} style={{ width: selectColWidth }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll?.()}
                  aria-label={t("admin.empScheduleSelectAll")}
                />
              </th>
            )}
            {headerCell("name", t("admin.employeesNameLabel"), true)}
            {headerCell("email", t("admin.employeesEmailLabel"), true)}
            {headerCell("password", t("admin.employeesPasswordColLabel"), true)}
            {headerCell("role", t("admin.employeesRoleLabel"), true)}
            {headerCell("department", t("admin.employeesDepartmentLabel"), true)}
            <th className={th} style={{ width: scheduleColWidth }}>
              {t("admin.empScheduleCol")}
            </th>
            <th
              className={`${th} text-right`}
              style={{ width: widths.actions, minWidth: MIN_WIDTHS.actions }}
            >
              <span className="sr-only">{t("admin.employeesColActions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedEmployees.map((e) => {
            const isSelf = callerUserId != null && e.user.id === callerUserId;
            const canEditThisRole =
              canEditRoles &&
              !isSelf &&
              assignableRoles.some((r) => canAssignRole(callerRole, e.user.role, r));
            const isBusy = rowBusyId === e.id;
            const canDeleteThis =
              canEditProfile && canDeleteEmployee(callerRole, e.user.role, isSelf);
            const deleteTitle = deleteDisabledReason(e, isSelf);
            const editingPassword = passwordEditId === e.id;

            return (
              <tr key={e.id} className={trDivider}>
                {showSelect && (
                  <td className={`${td} align-middle`}>
                    <input
                      type="checkbox"
                      checked={selectedIds!.has(e.id)}
                      onChange={() => onToggleSelect?.(e.id)}
                      disabled={isBusy}
                      aria-label={t("admin.empScheduleSelectRow").replace("{name}", e.name)}
                    />
                  </td>
                )}
                <td className={`${td} align-middle`}>
                  {canEditProfile ? (
                    <input
                      className={`${rowInput} font-medium`}
                      defaultValue={e.name}
                      key={`name-${e.id}-${e.name}`}
                      disabled={isBusy}
                      aria-label={t("admin.employeesNameLabel")}
                      onBlur={(ev) => onSaveName(e, ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <p className={`${rowControlStatic} truncate font-medium`}>{e.name}</p>
                  )}
                </td>
                <td className={`${td} align-middle`}>
                  {canEditProfile ? (
                    <input
                      type="email"
                      autoComplete="off"
                      className={rowInput}
                      defaultValue={e.user.email}
                      key={`email-${e.id}-${e.user.email}`}
                      disabled={isBusy}
                      aria-label={t("admin.employeesEmailLabel")}
                      onBlur={(ev) => onSaveEmail(e, ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <p className={`${rowControlStatic} truncate`}>{e.user.email}</p>
                  )}
                </td>
                <td className={`${td} align-middle`}>
                  {canEditProfile ? (
                    editingPassword ? (
                      <input
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        autoFocus
                        className={rowInput}
                        placeholder="····"
                        value={passwordDraft}
                        disabled={isBusy}
                        aria-label={t("admin.employeesPasswordLabel")}
                        onChange={(ev) => onPasswordDraftChange(ev.target.value)}
                        onBlur={() => onPasswordEditFinish(e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") {
                            ev.preventDefault();
                            onPasswordEditFinish(e.id);
                          }
                          if (ev.key === "Escape") onPasswordEditCancel();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`${rowPasswordMask} w-full cursor-pointer`}
                        disabled={isBusy}
                        title={t("admin.employeesPasswordReset")}
                        aria-label={t("admin.employeesPasswordReset")}
                        onClick={() => onPasswordEditStart(e.id)}
                      >
                        ********
                      </button>
                    )
                  ) : (
                    <span className={rowPasswordMask} aria-hidden>
                      ********
                    </span>
                  )}
                </td>
                <td className={`${td} align-middle`}>
                  {canEditThisRole ? (
                    <select
                      className={`auth-select-field ${rowControl}`}
                      value={e.user.role}
                      disabled={isBusy}
                      aria-label={t("admin.employeesRoleLabel")}
                      onChange={(ev) => onChangeRole(e, ev.target.value as Role)}
                    >
                      {[
                        e.user.role as Role,
                        ...assignableRoles.filter((r) => r !== e.user.role),
                      ].map((r) => (
                        <option
                          key={r}
                          value={r}
                          disabled={
                            !canAssignRole(callerRole, e.user.role, r) && r !== e.user.role
                          }
                        >
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`${rowControlStatic} truncate`}>{roleLabel(e.user.role)}</span>
                  )}
                </td>
                <td className={`${td} align-middle`}>
                  <select
                    className={`auth-select-field ${rowControl}`}
                    value={e.department?.id ?? ""}
                    disabled={isBusy || !canEditProfile}
                    aria-label={t("admin.employeesDepartmentLabel")}
                    onChange={(ev) => onChangeDepartment(e.id, ev.target.value)}
                  >
                    <option value="">{t("admin.employeesDepartmentNone")}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`${td} align-middle`}>
                  <p className="truncate text-[0.75rem] text-[var(--apple-label-secondary)]">
                    {e.scheduleSummary ?? "—"}
                  </p>
                  {canEditSchedule && onEditSchedule && (
                    <button
                      type="button"
                      className="mt-1 text-[0.75rem] font-medium text-[var(--apple-blue)] hover:underline"
                      disabled={isBusy}
                      onClick={() => onEditSchedule(e)}
                    >
                      {t("admin.empScheduleEdit")}
                    </button>
                  )}
                </td>
                <td className={`${td} align-middle text-right`}>
                  {canEditProfile ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className={`${btnDanger} whitespace-nowrap`}
                        disabled={!canDeleteThis || isBusy}
                        title={deleteTitle}
                        onClick={() => {
                          if (canDeleteThis) onDelete(e);
                        }}
                      >
                        {t("admin.employeesDelete")}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
