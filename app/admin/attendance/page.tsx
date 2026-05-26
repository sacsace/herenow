"use client";

import { AdminDayAttendanceMap } from "@/components/admin/AdminDayAttendanceMap";
import { AttendanceByEmployeeView } from "@/components/admin/attendance/ByEmployeeView";
import { CalendarDayDetailModal } from "@/components/admin/attendance/CalendarDayDetailModal";
import { AttendanceCalendarView } from "@/components/admin/attendance/CalendarView";
import { AttendanceChartView } from "@/components/admin/attendance/ChartView";
import { AttendanceDayTable } from "@/components/admin/attendance/DayTable";
import { AttendanceIssuesView } from "@/components/admin/attendance/IssuesView";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/components/LanguageProvider";
import type { AdminAttendanceDayRow } from "@/lib/adminAttendanceByDay";
import {
  btnPrimary,
  btnSecondary,
  emptyState,
  groupedCard,
  inputCompact,
  label,
  pageStack,
  searchActions,
  searchFieldCol,
  searchFiltersRow,
  segmentedBtn,
  segmentedWrap,
  selectSm,
  tableToolbar,
} from "@/lib/uiStyles";
import { useCallback, useEffect, useMemo, useState } from "react";

type AttendanceTab =
  | "daily"
  | "byEmployee"
  | "holiday"
  | "calendar"
  | "chart"
  | "map"
  | "issues";

type SearchFilters = {
  q: string;
  from: string;
  to: string;
  status: string;
  departmentId: string;
};

type DepartmentLite = { id: string; name: string };

function monthRangeFor(year: number, month: number): { from: string; to: string } {
  const mm = String(month + 1).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return monthRangeFor(now.getFullYear(), now.getMonth());
}

function shiftMonth(fromDate: string, delta: number): { from: string; to: string } {
  const [y, m] = fromDate.split("-").map(Number);
  const base = new Date(y ?? new Date().getFullYear(), (m ?? 1) - 1, 1);
  base.setMonth(base.getMonth() + delta);
  return monthRangeFor(base.getFullYear(), base.getMonth());
}

function defaultFilters(): SearchFilters {
  const { from, to } = currentMonthRange();
  return { q: "", from, to, status: "", departmentId: "" };
}

function filtersDifferFromDefault(f: SearchFilters): boolean {
  const d = defaultFilters();
  return (
    f.q !== d.q ||
    f.from !== d.from ||
    f.to !== d.to ||
    f.status !== d.status ||
    f.departmentId !== d.departmentId
  );
}

export default function AdminAttendancePage() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<AdminAttendanceDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AttendanceTab>("daily");
  const [draft, setDraft] = useState<SearchFilters>(() => defaultFilters());
  const [filters, setFilters] = useState<SearchFilters>(() => defaultFilters());
  const [mapMode, setMapMode] = useState<"single" | "range">("single");
  const [mapDate, setMapDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [mapFrom, setMapFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [mapTo, setMapTo] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [calendarDetailDate, setCalendarDetailDate] = useState<string | null>(null);

  const dateLocale = locale === "en" ? "en-US" : "ko-KR";

  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const r = await fetch("/api/admin/departments");
        if (!r.ok) return;
        const j = await r.json().catch(() => ({}));
        if (aborted) return;
        setDepartments(Array.isArray(j.departments) ? j.departments : []);
      } catch (e) {
        console.error("[attendance load departments]", e);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const tabs: { id: AttendanceTab; label: string }[] = [
    { id: "daily", label: t("admin.attendanceTabDaily") },
    { id: "byEmployee", label: t("admin.attendanceTabByEmployee") },
    { id: "holiday", label: t("admin.attendanceTabHoliday") },
    { id: "calendar", label: t("admin.attendanceTabCalendar") },
    { id: "map", label: t("admin.attendanceTabMap") },
    { id: "chart", label: t("admin.attendanceTabChart") },
    { id: "issues", label: t("admin.attendanceTabIssues") },
  ];

  const subtitleByTab: Record<AttendanceTab, string> = {
    daily: t("admin.attendanceTabDailyLead"),
    byEmployee: t("admin.attendanceTabByEmployeeLead"),
    holiday: t("admin.attendanceTabHolidayLead"),
    calendar: t("admin.attendanceTabCalendarLead"),
    map: t("admin.attendanceTabMapLead"),
    chart: t("admin.attendanceTabChartLead"),
    issues: t("admin.attendanceTabIssuesLead"),
  };

  const exportHref = useMemo(() => {
    const q = new URLSearchParams();
    if (filters.status) q.set("status", filters.status);
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    if (filters.q) q.set("q", filters.q);
    if (filters.departmentId) q.set("departmentId", filters.departmentId);
    const s = q.toString();
    return s ? `/api/admin/export?${s}` : "/api/admin/export";
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filters.status) q.set("status", filters.status);
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    if (filters.q) q.set("q", filters.q);
    if (filters.departmentId) q.set("departmentId", filters.departmentId);
    const r = await fetch(`/api/admin/attendance?${q.toString()}`);
    const j = await r.json();
    if (r.ok) setRows(j.days ?? []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ ...draft });
  }

  function resetSearch() {
    const next = defaultFilters();
    setDraft(next);
    setFilters(next);
  }

  const holidayRows = useMemo(() => rows.filter((r) => r.isHolidayWork), [rows]);
  const displayRows = tab === "holiday" ? holidayRows : rows;
  const hasActiveFilters = filtersDifferFromDefault(filters);

  function gotoMonth(delta: number) {
    const next = shiftMonth(filters.from || currentMonthRange().from, delta);
    setDraft({ ...draft, from: next.from, to: next.to });
    setFilters({ ...filters, from: next.from, to: next.to });
  }

  function gotoToday() {
    const next = currentMonthRange();
    setDraft({ ...draft, from: next.from, to: next.to });
    setFilters({ ...filters, from: next.from, to: next.to });
  }

  return (
    <div className={pageStack}>
      <PageHeader title={t("admin.attendanceTitle")} subtitle={subtitleByTab[tab]} />

      <div className={`max-w-full overflow-x-auto ${segmentedWrap}`}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={segmentedBtn(tab === item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "map" ? (
        <div className={groupedCard}>
          <div className={tableToolbar}>
            <div className={searchFiltersRow}>
              <div className={`${searchFieldCol} w-full sm:w-auto`}>
                <label className={label}>{t("admin.attendanceMapMode")}</label>
                <div className={segmentedWrap}>
                  <button
                    type="button"
                    className={segmentedBtn(mapMode === "single")}
                    onClick={() => setMapMode("single")}
                  >
                    {t("admin.attendanceMapModeSingle")}
                  </button>
                  <button
                    type="button"
                    className={segmentedBtn(mapMode === "range")}
                    onClick={() => setMapMode("range")}
                  >
                    {t("admin.attendanceMapModeRange")}
                  </button>
                </div>
              </div>
              {mapMode === "single" ? (
                <div className={`${searchFieldCol} w-full sm:w-[10rem]`}>
                  <label className={label} htmlFor="attendance-map-date">
                    {t("admin.attendanceMapDateLabel")}
                  </label>
                  <input
                    id="attendance-map-date"
                    type="date"
                    lang={dateLocale}
                    className={inputCompact}
                    value={mapDate}
                    onChange={(e) => setMapDate(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className={`${searchFieldCol} w-[calc(50%-0.375rem)] sm:w-[8.75rem]`}>
                    <label className={label} htmlFor="attendance-map-from">
                      {t("admin.attendanceDateFrom")}
                    </label>
                    <input
                      id="attendance-map-from"
                      type="date"
                      lang={dateLocale}
                      max={mapTo}
                      className={inputCompact}
                      value={mapFrom}
                      onChange={(e) => setMapFrom(e.target.value)}
                    />
                  </div>
                  <div className={`${searchFieldCol} w-[calc(50%-0.375rem)] sm:w-[8.75rem]`}>
                    <label className={label} htmlFor="attendance-map-to">
                      {t("admin.attendanceDateTo")}
                    </label>
                    <input
                      id="attendance-map-to"
                      type="date"
                      lang={dateLocale}
                      min={mapFrom}
                      className={inputCompact}
                      value={mapTo}
                      onChange={(e) => setMapTo(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className={searchActions}>
                <button
                  type="button"
                  className={`${btnSecondary} h-9`}
                  onClick={() => {
                    const d = new Date();
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const day = String(d.getDate()).padStart(2, "0");
                    const today = `${y}-${m}-${day}`;
                    if (mapMode === "single") {
                      setMapDate(today);
                    } else {
                      const start = new Date();
                      start.setDate(start.getDate() - 6);
                      const sy = start.getFullYear();
                      const sm = String(start.getMonth() + 1).padStart(2, "0");
                      const sd = String(start.getDate()).padStart(2, "0");
                      setMapFrom(`${sy}-${sm}-${sd}`);
                      setMapTo(today);
                    }
                  }}
                >
                  {mapMode === "single"
                    ? t("admin.attendanceMapToday")
                    : t("admin.attendanceMapLast7Days")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={groupedCard}>
          <form onSubmit={applySearch} className={tableToolbar}>
            <div className={searchFiltersRow}>
              <div className={`${searchFieldCol} w-full sm:w-auto sm:flex-1 sm:min-w-[14rem] sm:max-w-[18rem]`}>
                <label className={label} htmlFor="attendance-search-name">
                  {t("admin.attendanceSearchName")}
                </label>
                <input
                  id="attendance-search-name"
                  type="search"
                  className={inputCompact}
                  placeholder={t("admin.attendanceSearchNamePlaceholder")}
                  value={draft.q}
                  onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
                />
              </div>
              <div className={`${searchFieldCol} w-[calc(50%-0.375rem)] sm:w-[8.75rem]`}>
                <label className={label} htmlFor="attendance-from">
                  {t("admin.attendanceDateFrom")}
                </label>
                <input
                  id="attendance-from"
                  type="date"
                  lang={dateLocale}
                  className={inputCompact}
                  value={draft.from}
                  onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div className={`${searchFieldCol} w-[calc(50%-0.375rem)] sm:w-[8.75rem]`}>
                <label className={label} htmlFor="attendance-to">
                  {t("admin.attendanceDateTo")}
                </label>
                <input
                  id="attendance-to"
                  type="date"
                  lang={dateLocale}
                  className={inputCompact}
                  value={draft.to}
                  onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
                />
              </div>
              <div className={`${searchFieldCol} w-[calc(50%-0.375rem)] sm:w-[9.5rem]`}>
                <label className={label} htmlFor="attendance-department">
                  {t("admin.attendanceFilterDepartment")}
                </label>
                <select
                  id="attendance-department"
                  className={`${selectSm} !w-full !min-w-0`}
                  value={draft.departmentId}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, departmentId: e.target.value }))
                  }
                >
                  <option value="">{t("admin.attendanceFilterDepartmentAll")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${searchFieldCol} w-[calc(50%-0.375rem)] sm:w-[9.5rem]`}>
                <label className={label} htmlFor="attendance-status">
                  {t("admin.attendanceFilterStatus")}
                </label>
                <select
                  id="attendance-status"
                  className={`${selectSm} !w-full !min-w-0`}
                  value={draft.status}
                  onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">{t("admin.attendanceFilterAll")}</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
              <div className={searchActions}>
                <button type="submit" className={`${btnPrimary} h-9 px-4`}>
                  {t("admin.attendanceSearchApply")}
                </button>
                {hasActiveFilters && (
                  <button type="button" onClick={resetSearch} className={`${btnSecondary} h-9`}>
                    {t("admin.attendanceSearchReset")}
                  </button>
                )}
                <a href={exportHref} className={`${btnSecondary} h-9`}>
                  Excel
                </a>
              </div>
            </div>
          </form>
        </div>
      )}

      {tab === "map" ? (
        mapMode === "single" ? (
          <AdminDayAttendanceMap date={mapDate} />
        ) : (
          <AdminDayAttendanceMap from={mapFrom} to={mapTo} />
        )
      ) : loading ? (
        <p className="text-[1rem] text-[var(--apple-label-secondary)]">{t("common.loading")}</p>
      ) : tab === "calendar" ? (
        <AttendanceCalendarView
          rows={rows}
          month={filters.from || currentMonthRange().from}
          dateLocale={dateLocale}
          onPrevMonth={() => gotoMonth(-1)}
          onNextMonth={() => gotoMonth(1)}
          onToday={gotoToday}
          onPickDay={(d) => setCalendarDetailDate(d)}
        />
      ) : tab === "chart" ? (
        rows.length === 0 ? (
          <p className={emptyState}>{t("admin.attendanceEmpty")}</p>
        ) : (
          <AttendanceChartView
            rows={rows}
            fromDate={filters.from || currentMonthRange().from}
            toDate={filters.to || currentMonthRange().to}
            dateLocale={dateLocale}
          />
        )
      ) : tab === "issues" ? (
        <AttendanceIssuesView
          from={filters.from || currentMonthRange().from}
          to={filters.to || currentMonthRange().to}
          departmentId={filters.departmentId || null}
          query={filters.q}
        />
      ) : displayRows.length === 0 ? (
        <p className={emptyState}>{t("admin.attendanceEmpty")}</p>
      ) : tab === "byEmployee" ? (
        <AttendanceByEmployeeView rows={displayRows} dateLocale={dateLocale} />
      ) : (
        <AttendanceDayTable rows={displayRows} dateLocale={dateLocale} />
      )}

      <CalendarDayDetailModal
        open={calendarDetailDate !== null}
        onClose={() => setCalendarDetailDate(null)}
        date={calendarDetailDate}
        rows={rows}
        dateLocale={dateLocale}
      />
    </div>
  );
}
