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
    return (
      <>
        {p.site.name}
        <span className={metaCaption}>{distanceText}</span>
      </>
    );
  }
  return null;
}

export function attendanceFlagsRow(
  r: Pick<
    AdminAttendanceDayRow,
    "isHolidayWork" | "isLate" | "isEarlyLeave" | "isOvertime" | "overtimeMinutes"
  >,
  t?: T
) {
  if (!r.isHolidayWork && !r.isLate && !r.isEarlyLeave && !r.isOvertime) {
    return <span className="text-[var(--apple-label-tertiary)]">—</span>;
  }
  const lbl = (key: string, fallback: string) => (t ? t(key) : fallback);
  const overtimeText =
    r.overtimeMinutes > 0
      ? t
        ? t("admin.attendanceFlagOverBy").replace("{d}", formatDurationMinutes(r.overtimeMinutes, t))
        : `초과 ${formatDurationMinutes(r.overtimeMinutes)}`
      : "";

  // 지각 + 초과가 함께면 "지각 (초과 X시간 Y분)" 한 칩으로 결합 표기
  const lateChip = r.isLate ? (
    <span className="font-medium text-[var(--apple-orange-dark)]">
      {lbl("admin.attendanceFlagLate", "지각")}
      {overtimeText ? ` (${overtimeText})` : ""}{" "}
    </span>
  ) : null;

  // 지각 없이 초과만 있을 때
  const overtimeChip = !r.isLate && r.isOvertime ? (
    <span className="font-medium text-[var(--apple-blue)]">
      {overtimeText || lbl("admin.attendanceFlagOvertime", "초과")}{" "}
    </span>
  ) : null;

  return (
    <>
      {r.isHolidayWork && (
        <span className="font-medium text-[var(--apple-blue)]">
          {lbl("admin.attendanceFlagHolidayWork", "휴일근무")}{" "}
        </span>
      )}
      {lateChip}
      {r.isEarlyLeave && (
        <span className="font-medium text-[var(--apple-orange-dark)]">
          {lbl("admin.attendanceFlagEarlyLeave", "조퇴")}{" "}
        </span>
      )}
      {overtimeChip}
    </>
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
