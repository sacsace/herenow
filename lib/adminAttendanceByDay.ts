import { calendarDayInTz, timeInTz } from "@/lib/adminMonthlyAttendance";
import { recordDisplayTimezone } from "@/lib/companyTimezones";
import type { AttendanceStatus, AttendanceType } from "@prisma/client";

export type AttendancePunchSummary = {
  id: string;
  timestamp: string;
  time: string;
  latitude: number;
  longitude: number;
  distanceFromSite: number;
  outsideGeofence: boolean;
  status: AttendanceStatus;
  isLate: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  isHolidayWork: boolean;
  lateMinutes: number;
  overtimeMinutes: number;
  isBusinessTrip: boolean;
  businessTripLocation: string | null;
  businessTripReason: string | null;
  memo: string | null;
  site: { name: string } | null;
};

export type AdminAttendanceDayRow = {
  id: string;
  /** 출근일(회사 타임존). 야간 근무는 출근 날짜 기준 */
  date: string;
  /** 퇴근일(회사 타임존). 출근·퇴근이 다른 날이면 필터용 */
  checkOutDate: string | null;
  employeeId: string;
  employeeName: string;
  checkIn: AttendancePunchSummary | null;
  checkOut: AttendancePunchSummary | null;
  incomplete: boolean;
  pending: boolean;
  status: AttendanceStatus | "MIXED";
  isLate: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  isHolidayWork: boolean;
  lateMinutes: number;
  overtimeMinutes: number;
};

type RecordInput = {
  id: string;
  employeeId: string;
  type: AttendanceType;
  timestamp: Date;
  latitude: number;
  longitude: number;
  distanceFromSite: number;
  outsideGeofence: boolean;
  status: AttendanceStatus;
  isLate: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  isHolidayWork: boolean;
  lateMinutes: number;
  overtimeMinutes: number;
  memo: string | null;
  isBusinessTrip: boolean;
  businessTripLocation: string | null;
  businessTripReason: string | null;
  recordTimezone?: string | null;
  employee: { name: string };
  site: { name: string } | null;
};

function toPunchSummary(r: RecordInput, timeZone: string): AttendancePunchSummary {
  return {
    id: r.id,
    timestamp: r.timestamp.toISOString(),
    time: timeInTz(r.timestamp, timeZone),
    latitude: r.latitude,
    longitude: r.longitude,
    distanceFromSite: r.distanceFromSite,
    outsideGeofence: r.outsideGeofence,
    status: r.status,
    isLate: r.isLate,
    isEarlyLeave: r.isEarlyLeave,
    isOvertime: r.isOvertime,
    isHolidayWork: r.isHolidayWork,
    lateMinutes: r.lateMinutes,
    overtimeMinutes: r.overtimeMinutes,
    isBusinessTrip: r.isBusinessTrip,
    businessTripLocation: r.businessTripLocation,
    businessTripReason: r.businessTripReason,
    memo: r.memo,
    site: r.site,
  };
}


function buildDayRow(
  employeeId: string,
  employeeName: string,
  date: string,
  checkOutDate: string | null,
  pairIndex: number,
  checkIn: AttendancePunchSummary | null,
  checkOut: AttendancePunchSummary | null,
  pending: boolean
): AdminAttendanceDayRow {
  const incomplete = Boolean((checkIn && !checkOut) || (!checkIn && checkOut));
  // 야간 근무 근태는 출근일(checkIn) 기준으로 통합 판정한다.
  // - 출근일이 휴일이면 해당 근무 전체를 휴일근무로 간주하고 지각/조퇴/초과는 의미 없음
  // - 출근이 없는 (퇴근만 기록된) 비정상 케이스는 퇴근의 플래그를 그대로 사용
  const baseIsHoliday = checkIn ? checkIn.isHolidayWork : checkOut?.isHolidayWork ?? false;
  const isLate = baseIsHoliday ? false : checkIn?.isLate ?? false;
  const isEarlyLeave = baseIsHoliday ? false : checkOut?.isEarlyLeave ?? false;
  const isOvertime = baseIsHoliday ? false : checkOut?.isOvertime ?? false;
  const lateMinutes = baseIsHoliday ? 0 : checkIn?.lateMinutes ?? 0;
  const overtimeMinutes = baseIsHoliday ? 0 : checkOut?.overtimeMinutes ?? 0;

  return {
    id: `${employeeId}:${date}:${pairIndex}`,
    date,
    checkOutDate,
    employeeId,
    employeeName,
    checkIn,
    checkOut,
    incomplete,
    pending,
    status: dayStatus(checkIn, checkOut),
    isLate,
    isEarlyLeave,
    isOvertime,
    isHolidayWork: baseIsHoliday,
    lateMinutes,
    overtimeMinutes,
  };
}

function rowInDateRange(row: AdminAttendanceDayRow, from?: string, to?: string): boolean {
  const dates = [row.date];
  if (row.checkOutDate && row.checkOutDate !== row.date) dates.push(row.checkOutDate);
  return dates.some((d) => {
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function dayStatus(
  checkIn: AttendancePunchSummary | null,
  checkOut: AttendancePunchSummary | null
): AttendanceStatus | "MIXED" {
  const statuses = new Set<AttendanceStatus>();
  if (checkIn) statuses.add(checkIn.status);
  if (checkOut) statuses.add(checkOut.status);
  if (statuses.size === 0) return "APPROVED";
  if (statuses.size === 1) return [...statuses][0]!;
  if (statuses.has("REJECTED")) return "REJECTED";
  if (statuses.has("PENDING")) return "PENDING";
  return "MIXED";
}

function matchesStatusFilter(
  row: AdminAttendanceDayRow,
  statusFilter: string | undefined
): boolean {
  if (!statusFilter) return true;
  if (row.status === statusFilter) return true;
  if (row.checkIn?.status === statusFilter) return true;
  if (row.checkOut?.status === statusFilter) return true;
  return false;
}

export function aggregateAttendanceByDay(
  records: RecordInput[],
  companyTimeZone: string,
  statusFilter?: string
): AdminAttendanceDayRow[] {
  const companyTz = companyTimeZone.trim() || "UTC";
  const byEmployee = new Map<string, RecordInput[]>();

  for (const r of records) {
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push(r);
    byEmployee.set(r.employeeId, list);
  }

  const rows: AdminAttendanceDayRow[] = [];

  for (const [employeeId, empRecords] of byEmployee) {
    empRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let openCheckIn: RecordInput | null = null;
    let pairIndex = 0;

    function pushPair(checkIn: RecordInput | null, checkOut: RecordInput | null) {
      if (!checkIn && !checkOut) return;

      const employeeName =
        checkIn?.employee.name ?? checkOut!.employee.name;
      const checkInTz = checkIn
        ? recordDisplayTimezone(checkIn, companyTz)
        : checkOut
          ? recordDisplayTimezone(checkOut, companyTz)
          : companyTz;
      const checkOutTz = checkOut ? recordDisplayTimezone(checkOut, companyTz) : checkInTz;
      const checkInPunch = checkIn ? toPunchSummary(checkIn, checkInTz) : null;
      const checkOutPunch = checkOut ? toPunchSummary(checkOut, checkOutTz) : null;
      const date = calendarDayInTz((checkIn ?? checkOut!).timestamp, checkInTz);
      const checkOutDate = checkOut ? calendarDayInTz(checkOut.timestamp, checkOutTz) : null;
      const pending =
        checkIn?.status === "PENDING" || checkOut?.status === "PENDING" || false;

      const row = buildDayRow(
        employeeId,
        employeeName,
        date,
        checkOutDate,
        pairIndex++,
        checkInPunch,
        checkOutPunch,
        pending
      );
      if (matchesStatusFilter(row, statusFilter)) {
        rows.push(row);
      }
    }

    for (const r of empRecords) {
      if (r.type === "CHECK_IN") {
        if (openCheckIn) {
          pushPair(openCheckIn, null);
        }
        openCheckIn = r;
      } else if (openCheckIn) {
        pushPair(openCheckIn, r);
        openCheckIn = null;
      } else {
        pushPair(null, r);
      }
    }

    if (openCheckIn) {
      pushPair(openCheckIn, null);
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aOut = a.checkOut?.timestamp ?? "";
    const bOut = b.checkOut?.timestamp ?? "";
    if (aOut !== bOut) return aOut < bOut ? 1 : -1;
    return a.employeeName.localeCompare(b.employeeName, "ko");
  });

  return rows;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function filterAttendanceDayRows(
  rows: AdminAttendanceDayRow[],
  filters: { from?: string; to?: string; q?: string }
): AdminAttendanceDayRow[] {
  const q = filters.q?.trim().toLowerCase();
  const from = filters.from && DATE_ONLY.test(filters.from) ? filters.from : undefined;
  const to = filters.to && DATE_ONLY.test(filters.to) ? filters.to : undefined;
  return rows.filter((row) => {
    if (!rowInDateRange(row, from, to)) return false;
    if (q && !row.employeeName.toLowerCase().includes(q)) return false;
    return true;
  });
}
