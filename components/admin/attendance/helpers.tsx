import { metaCaption } from "@/lib/statusBadge";
import type { AdminAttendanceDayRow, AttendancePunchSummary } from "@/lib/adminAttendanceByDay";

type T = (path: string) => string;

/**
 * 분 단위 시간을 "N분" 또는 "X시간 Y분" 형태로 포맷.
 * 60분 미만은 분만, 60분 이상은 시간:분으로 표기한다.
 * 영어 로케일일 때는 "Nm" / "Xh Ym" 형태.
 *
 * 로케일 판별은 t("admin.attendanceDurationMinute") 가 "분" 인지 "m" 인지로 한다.
 */
export function formatDurationMinutes(minutes: number, t?: T): string {
  const safe = Math.max(0, Math.round(minutes));
  if (!t) {
    if (safe < 60) return `${safe}분`;
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  }
  if (safe < 60) {
    return t("admin.attendanceDurationMinutes").replace("{n}", String(safe));
  }
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (m === 0) {
    return t("admin.attendanceDurationHours").replace("{h}", String(h));
  }
  return t("admin.attendanceDurationHm")
    .replace("{h}", String(h))
    .replace("{m}", String(m));
}

/** 회사 표준 일근무 시간 (분). 정시 9-18 = 9시간 기준. */
export const STANDARD_WORK_MINUTES = 9 * 60;

/**
 * 근무 분 — 출근/퇴근 timestamp 차이를 분으로.
 * 둘 중 하나라도 없으면 null. 음수는 0.
 */
export function workMinutesOf(
  checkIn: { timestamp: string } | null | undefined,
  checkOut: { timestamp: string } | null | undefined
): number | null {
  if (!checkIn || !checkOut) return null;
  const diffMs = new Date(checkOut.timestamp).getTime() - new Date(checkIn.timestamp).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

/**
 * 근무 시간 — 출근/퇴근 timestamp 차이를 사람 친화적 텍스트로.
 * 둘 중 하나라도 없으면 null. 음수는 0 으로 보정.
 */
export function formatWorkDuration(
  checkIn: { timestamp: string } | null | undefined,
  checkOut: { timestamp: string } | null | undefined,
  t?: T
): string | null {
  const totalMin = workMinutesOf(checkIn, checkOut);
  if (totalMin === null) return null;
  return formatDurationMinutes(totalMin, t);
}

export function formatShortDate(date: string, locale = "ko-KR") {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    month: "numeric",
    day: "numeric",
  });
}

export function formatAttendanceDate(date: string, locale = "ko-KR") {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function locationLabel(p: AttendancePunchSummary, t?: T) {
  if (p.isBusinessTrip && p.businessTripLocation) {
    return p.businessTripLocation;
  }
  if (p.site?.name) {
    const distance = Math.round(p.distanceFromSite);
    const distanceText = t
      ? t("admin.attendanceLocationDistance").replace("{m}", String(distance))
      : `약 ${distance}m`;
    const outsideText =
      p.outsideGeofence && t ? (
        <span className={`${metaCaption} text-amber-600`}>
          {t("admin.attendanceOutsideGeofence")}
        </span>
      ) : p.outsideGeofence ? (
        <span className={`${metaCaption} text-amber-600`}>반경 밖</span>
      ) : null;
    return (
      <>
        {p.site.name}
        <span className={metaCaption}>{distanceText}</span>
        {outsideText}
      </>
    );
  }
  return null;
}

export function attendanceFlagsRow(
  r: Pick<
    AdminAttendanceDayRow,
    | "isHolidayWork"
    | "isLate"
    | "isEarlyLeave"
    | "isOvertime"
    | "lateMinutes"
    | "overtimeMinutes"
  >,
  t?: T
) {
  if (!r.isHolidayWork && !r.isLate && !r.isEarlyLeave && !r.isOvertime) {
    return <span className="text-[var(--apple-label-tertiary)]">—</span>;
  }
  const lbl = (key: string, fallback: string) => (t ? t(key) : fallback);

  const lateLabel = lbl("admin.attendanceFlagLate", "지각");
  const overtimeLabel = lbl("admin.attendanceFlagOvertime", "초과 근무");
  const earlyLabel = lbl("admin.attendanceFlagEarlyLeave", "조퇴");
  const holidayLabel = lbl("admin.attendanceFlagHolidayWork", "휴일근무");

  const lateText =
    r.isLate && r.lateMinutes > 0
      ? `${lateLabel} ${formatDurationMinutes(r.lateMinutes, t)}`
      : r.isLate
        ? lateLabel
        : null;

  const overtimeText =
    r.isOvertime && r.overtimeMinutes > 0
      ? `${overtimeLabel} ${formatDurationMinutes(r.overtimeMinutes, t)}`
      : r.isOvertime
        ? overtimeLabel
        : null;

  return (
    <span className="flex flex-col items-start gap-0.5 leading-tight">
      {r.isHolidayWork && (
        <span className="font-medium text-[var(--apple-blue)]">{holidayLabel}</span>
      )}
      {lateText && (
        <span className="font-medium text-[var(--apple-orange-dark)]">{lateText}</span>
      )}
      {r.isEarlyLeave && (
        <span className="font-medium text-[var(--apple-orange-dark)]">{earlyLabel}</span>
      )}
      {overtimeText && (
        <span className="font-medium text-[var(--apple-blue)]">{overtimeText}</span>
      )}
    </span>
  );
}

export function groupRowsByEmployee(rows: AdminAttendanceDayRow[]) {
  const map = new Map<string, AdminAttendanceDayRow[]>();
  for (const row of rows) {
    const list = map.get(row.employeeId) ?? [];
    list.push(row);
    map.set(row.employeeId, list);
  }
  return [...map.values()]
    .map((list) =>
      [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    )
    .sort((a, b) => a[0]!.employeeName.localeCompare(b[0]!.employeeName, "ko"));
}

export function chartSeriesFromRows(rows: AdminAttendanceDayRow[], days = 14) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.checkIn) {
      counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
    }
  }
  const sortedDates = [...counts.keys()].sort((a, b) => (a < b ? 1 : -1)).slice(0, days);
  return sortedDates
    .sort()
    .map((date) => ({
      date,
      count: counts.get(date) ?? 0,
      label: date.slice(5).replace("-", "/"),
    }));
}
