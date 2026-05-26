import { localMinutesFromDate, parseHHmm } from "@/lib/attendanceRules";
import { formatInTimeZone } from "date-fns-tz";

/** JS Date.getDay(): 0=일요일 … 6=토요일 */
export const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * 0(일요일)~6(토요일) 인덱스를 받아 로케일에 맞는 짧은 요일 라벨을 반환.
 */
export function weekdayShortLabel(dayIndex: number, locale: "ko" | "en"): string {
  if (dayIndex < 0 || dayIndex > 6) return "";
  return locale === "en" ? WEEKDAY_LABELS_EN[dayIndex] : WEEKDAY_LABELS_KO[dayIndex];
}

export const DEFAULT_WORK_DAYS = "1,2,3,4,5";
export const DEFAULT_WORK_START = "09:00";
export const DEFAULT_WORK_END = "18:00";

export type CompanyWorkSchedule = {
  workStartTime: string | null;
  workEndTime: string | null;
  workDays: string | null;
};

export type AttendanceWorkFlags = {
  isLate: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  isHolidayWork: boolean;
  overtimeMinutes: number;
};

export function parseWorkDays(workDays: string | null | undefined): Set<number> {
  const raw = workDays?.trim();
  if (!raw) return new Set([1, 2, 3, 4, 5]);
  const set = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return set.size > 0 ? set : new Set([1, 2, 3, 4, 5]);
}

export function formatWorkDays(days: Set<number>): string {
  return [...days].sort((a, b) => a - b).join(",");
}

export function localWeekday(timestamp: Date, timeZone: string): number {
  const tz = timeZone.trim() || "UTC";
  try {
    const iso = Number(formatInTimeZone(timestamp, tz, "i"));
    return iso === 7 ? 0 : iso;
  } catch {
    return timestamp.getUTCDay();
  }
}

export function isWorkDay(timestamp: Date, timeZone: string, workDays: Set<number>): boolean {
  return workDays.has(localWeekday(timestamp, timeZone));
}

export function evaluateAttendanceWorkFlags(
  timestamp: Date,
  timeZone: string,
  type: "CHECK_IN" | "CHECK_OUT",
  schedule: CompanyWorkSchedule
): AttendanceWorkFlags {
  const tz = timeZone.trim() || "UTC";
  const workDays = parseWorkDays(schedule.workDays);
  const onWorkDay = isWorkDay(timestamp, tz, workDays);
  const nowMin = localMinutesFromDate(timestamp, tz);
  const startMin = parseHHmm(schedule.workStartTime ?? DEFAULT_WORK_START);
  const endMin = parseHHmm(schedule.workEndTime ?? DEFAULT_WORK_END);

  let isLate = false;
  let isEarlyLeave = false;
  let isOvertime = false;
  const isHolidayWork = !onWorkDay;
  let overtimeMinutes = 0;

  if (type === "CHECK_IN") {
    if (onWorkDay && startMin != null) {
      isLate = nowMin > startMin;
    }
  } else {
    if (onWorkDay && endMin != null) {
      if (nowMin < endMin) isEarlyLeave = true;
      if (nowMin > endMin) {
        isOvertime = true;
        overtimeMinutes = nowMin - endMin;
      }
    }
  }

  return { isLate, isEarlyLeave, isOvertime, isHolidayWork, overtimeMinutes };
}

export function workDaysToArray(workDays: string | null | undefined): number[] {
  return [...parseWorkDays(workDays)].sort((a, b) => a - b);
}
