"use client";

import { useI18n } from "@/components/LanguageProvider";
import {
  attendanceFlagsRow,
  formatAttendanceDate,
  formatWorkDuration,
  STANDARD_WORK_MINUTES,
  workMinutesOf,
} from "@/components/admin/attendance/helpers";
import type { AdminAttendanceDayRow } from "@/lib/adminAttendanceByDay";
import { statusBadge } from "@/lib/statusBadge";
import {
  btnSecondary,
  emptyStateCompact,
  hint,
} from "@/lib/uiStyles";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  /** YYYY-MM-DD */
  date: string | null;
  rows: AdminAttendanceDayRow[];
  dateLocale?: string;
};

export function CalendarDayDetailModal({ open, onClose, date, rows, dateLocale }: Props) {
  const { t, locale } = useI18n();
  const dl = dateLocale ?? (locale === "en" ? "en-US" : "ko-KR");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const dayRows = useMemo(() => {
    if (!date) return [];
    return rows
      .filter((r) => r.date === date || r.checkOutDate === date)
      .sort((a, b) => {
        const ai = a.checkIn?.timestamp ?? a.checkOut?.timestamp ?? "";
        const bi = b.checkIn?.timestamp ?? b.checkOut?.timestamp ?? "";
        if (ai !== bi) return ai < bi ? -1 : 1;
        return a.employeeName.localeCompare(b.employeeName, "ko");
      });
  }, [rows, date]);

  const summary = useMemo(() => {
    const employees = new Set<string>();
    let late = 0;
    let early = 0;
    let overtime = 0;
    let holiday = 0;
    let pending = 0;
    let incomplete = 0;
    let underHours = 0;
    for (const r of dayRows) {
      employees.add(r.employeeId);
      if (r.isLate) late += 1;
      if (r.isEarlyLeave) early += 1;
      if (r.isOvertime) overtime += 1;
      if (r.isHolidayWork) holiday += 1;
      if (r.pending) pending += 1;
      if (r.incomplete) incomplete += 1;
      const wm = workMinutesOf(r.checkIn, r.checkOut);
      if (wm !== null && wm < STANDARD_WORK_MINUTES) underHours += 1;
    }
    return {
      total: dayRows.length,
      employees: employees.size,
      late,
      early,
      overtime,
      holiday,
      pending,
      incomplete,
      underHours,
    };
  }, [dayRows]);

  if (!open || !mounted || !date) return null;

  const dateLabel = formatAttendanceDate(date, dl);

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={dateLabel}
    >
      <button
        type="button"
        aria-label={t("admin.attendanceCalendarDetailClose")}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-sm"
      />
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[var(--background)] shadow-2xl ring-1 ring-black/[0.05] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--separator)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[1rem] font-semibold text-[var(--foreground)]">{dateLabel}</h2>
            <p className={`mt-1 ${hint}`}>
              {t("admin.attendanceCalendarDetailLead")
                .replace("{count}", String(summary.total))
                .replace("{employees}", String(summary.employees))}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("admin.attendanceCalendarDetailClose")}
            onClick={onClose}
            className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] text-[var(--apple-label-secondary)] transition-colors hover:bg-[var(--fill-secondary)] hover:text-[var(--foreground)]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>

        {summary.total > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--separator)] bg-[var(--fill-tertiary)]/40 px-5 py-2.5 text-[0.8125rem] sm:px-6">
            {summary.late > 0 && (
              <span className="text-[var(--apple-orange-dark)]">
                {t("admin.attendanceCalendarLate").replace("{n}", String(summary.late))}
              </span>
            )}
            {summary.early > 0 && (
              <span className="text-[var(--apple-orange-dark)]">
                {t("admin.attendanceCalendarEarly").replace("{n}", String(summary.early))}
              </span>
            )}
            {summary.overtime > 0 && (
              <span className="text-[var(--apple-blue)]">
                {t("admin.attendanceCalendarOvertime").replace("{n}", String(summary.overtime))}
              </span>
            )}
            {summary.holiday > 0 && (
              <span className="text-[var(--apple-blue)]">
                {t("admin.attendanceCalendarHoliday").replace("{n}", String(summary.holiday))}
              </span>
            )}
            {summary.incomplete > 0 && (
              <span className="text-[var(--apple-red)]">
                {t("admin.attendanceCalendarIncomplete").replace("{n}", String(summary.incomplete))}
              </span>
            )}
            {summary.pending > 0 && (
              <span className="text-[var(--apple-label-secondary)]">
                {t("admin.attendanceCalendarPending").replace("{n}", String(summary.pending))}
              </span>
            )}
            {summary.underHours > 0 && (
              <span className="text-[var(--apple-red)]">
                {t("admin.attendanceCalendarDetailUnderHours").replace(
                  "{n}",
                  String(summary.underHours)
                )}
              </span>
            )}
            {summary.late === 0 &&
              summary.early === 0 &&
              summary.overtime === 0 &&
              summary.holiday === 0 &&
              summary.incomplete === 0 &&
              summary.pending === 0 &&
              summary.underHours === 0 && (
                <span className="text-[var(--apple-green-dark)]">
                  {t("admin.attendanceCalendarNormal")}
                </span>
              )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {dayRows.length === 0 ? (
            <p className={emptyStateCompact}>{t("admin.attendanceEmpty")}</p>
          ) : (
            <ul className="divide-y divide-[var(--separator)]">
              {dayRows.map((r) => {
                const workDuration = formatWorkDuration(r.checkIn, r.checkOut, t);
                const wm = workMinutesOf(r.checkIn, r.checkOut);
                const isUnder = wm !== null && wm < STANDARD_WORK_MINUTES;
                return (
                  <li key={r.id} className="px-5 py-3 sm:px-6">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-semibold text-[var(--foreground)]">
                        {r.employeeName}
                      </span>
                      <span className={statusBadge(r.status)}>{r.status}</span>
                      {r.incomplete && (
                        <span className="text-[0.75rem] font-medium text-[var(--apple-orange-dark)]">
                          {t("admin.attendanceIncomplete")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[0.875rem] sm:grid-cols-2">
                      <div className="flex items-baseline gap-2">
                        <span className="w-12 shrink-0 text-[0.75rem] uppercase tracking-[0.04em] text-[var(--apple-label-tertiary)]">
                          {t("admin.attendanceColCheckIn")}
                        </span>
                        {r.checkIn ? (
                          <span className="font-semibold tabular-nums text-[var(--foreground)]">
                            {r.checkIn.time}
                            {r.checkIn.site?.name ? (
                              <span className="ml-2 font-normal text-[var(--apple-label-secondary)]">
                                {r.checkIn.site.name}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-[var(--apple-label-tertiary)]">—</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="w-12 shrink-0 text-[0.75rem] uppercase tracking-[0.04em] text-[var(--apple-label-tertiary)]">
                          {t("admin.attendanceColCheckOut")}
                        </span>
                        {r.checkOut ? (
                          <span className="font-semibold tabular-nums text-[var(--foreground)]">
                            {r.checkOut.time}
                            {r.checkOut.site?.name ? (
                              <span className="ml-2 font-normal text-[var(--apple-label-secondary)]">
                                {r.checkOut.site.name}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-[var(--apple-label-tertiary)]">—</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="w-12 shrink-0 text-[0.75rem] uppercase tracking-[0.04em] text-[var(--apple-label-tertiary)]">
                          {t("admin.attendanceColWorkHours")}
                        </span>
                        {workDuration ? (
                          <span
                            className={`font-medium tabular-nums ${
                              isUnder ? "text-[var(--apple-red)]" : "text-[var(--foreground)]"
                            }`}
                            title={
                              isUnder ? t("admin.attendanceWorkUnderTooltip") : undefined
                            }
                          >
                            {workDuration}
                          </span>
                        ) : (
                          <span className="text-[var(--apple-label-tertiary)]">—</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="w-12 shrink-0 text-[0.75rem] uppercase tracking-[0.04em] text-[var(--apple-label-tertiary)]">
                          {t("admin.attendanceColFlags")}
                        </span>
                        <span className="text-[0.8125rem]">{attendanceFlagsRow(r, t)}</span>
                      </div>
                    </div>
                    {r.checkIn?.isBusinessTrip && (
                      <p className="mt-1.5 text-[0.75rem] text-[var(--apple-label-secondary)]">
                        <span className="font-medium text-[var(--apple-blue)]">
                          {t("admin.attendanceColTrip")}:
                        </span>{" "}
                        {r.checkIn.businessTripLocation ?? t("admin.attendanceTripFallback")}
                        {r.checkIn.businessTripReason
                          ? ` — ${r.checkIn.businessTripReason}`
                          : null}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex justify-end border-t border-[var(--separator)] px-5 py-3 sm:px-6">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {t("admin.attendanceCalendarDetailClose")}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
