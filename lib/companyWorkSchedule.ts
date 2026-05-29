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
  /** {"1":{"workStartTime":"09:00","workEndTime":"18:00"}, ...} */
  workScheduleByDay?: unknown;
};

export type WorkDayTimeWindow = {
  workStartTime: string;
  workEndTime: string;
};

export type WorkScheduleByDay = Partial<Record<number, WorkDayTimeWindow>>;

export type AttendanceWorkFlags = {
  isLate: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  isHolidayWork: boolean;
  /** 지각 분 — 정시 출근 시각보다 nowMin 이 큰 만큼. 0 이상 */
  lateMinutes: number;
  /** 초과근무 분 — 정시 퇴근 시각보다 늦게 퇴근한 분. 0 이상 */
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

/** 요일별 시간표(JSON) 정규화 */
export function normalizeWorkScheduleByDay(raw: unknown): WorkScheduleByDay {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: WorkScheduleByDay = {};
  for (const [k, v] of Object.entries(obj)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!v || typeof v !== "object") continue;
    const item = v as Record<string, unknown>;
    const start = typeof item.workStartTime === "string" ? item.workStartTime.trim() : "";
    const end = typeof item.workEndTime === "string" ? item.workEndTime.trim() : "";
    const startMin = parseHHmm(start);
    const endMin = parseHHmm(end);
    if (startMin == null || endMin == null || startMin >= endMin) continue;
    out[day] = { workStartTime: start, workEndTime: end };
  }
  return out;
}

function resolveWorkMinutesWindow(
  timestamp: Date,
  timeZone: string,
  schedule: CompanyWorkSchedule
): { startMin: number | null; endMin: number | null } {
  const tz = timeZone.trim() || "UTC";
  const day = localWeekday(timestamp, tz);
  const byDay = normalizeWorkScheduleByDay(schedule.workScheduleByDay);
  const dayWindow = byDay[day];
  const startStr = dayWindow?.workStartTime ?? schedule.workStartTime ?? DEFAULT_WORK_START;
  const endStr = dayWindow?.workEndTime ?? schedule.workEndTime ?? DEFAULT_WORK_END;
  return {
    startMin: parseHHmm(startStr),
    endMin: parseHHmm(endStr),
  };
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
  const { startMin, endMin } = resolveWorkMinutesWindow(timestamp, tz, schedule);

  let isLate = false;
  let isEarlyLeave = false;
  let isOvertime = false;
  const isHolidayWork = !onWorkDay;
  let lateMinutes = 0;
  let overtimeMinutes = 0;

  const isOvernight =
    startMin != null && endMin != null && endMin <= startMin;

  if (type === "CHECK_IN") {
    if (onWorkDay && startMin != null) {
      if (isOvernight) {
        if (nowMin > startMin) {
          isLate = true;
          lateMinutes = nowMin - startMin;
        }
      } else if (nowMin > startMin) {
        isLate = true;
        lateMinutes = nowMin - startMin;
      }
    }
  } else if (onWorkDay && endMin != null) {
    if (isOvernight) {
      if (nowMin < endMin && nowMin < (startMin ?? 0)) isEarlyLeave = true;
      if (nowMin > endMin && nowMin < (startMin ?? 24 * 60)) {
        isOvertime = true;
        overtimeMinutes = nowMin - endMin;
      }
      if (startMin != null && nowMin > startMin) isEarlyLeave = true;
    } else {
      if (nowMin < endMin) isEarlyLeave = true;
      if (nowMin > endMin) {
        isOvertime = true;
        overtimeMinutes = nowMin - endMin;
      }
    }
  }

  return { isLate, isEarlyLeave, isOvertime, isHolidayWork, lateMinutes, overtimeMinutes };
}

export function workDaysToArray(workDays: string | null | undefined): number[] {
  return [...parseWorkDays(workDays)].sort((a, b) => a - b);
}

/**
 * CHECK_IN timestamp 와 회사 스케줄로부터 지각 분을 계산.
 * 휴일이거나 정시 출근 이전이면 0.
 * (마이그레이션 이전 기록 — lateMinutes 컬럼이 0 — 의 보정용)
 */
export function lateMinutesFor(
  timestamp: Date,
  timeZone: string,
  schedule: CompanyWorkSchedule
): number {
  const tz = timeZone.trim() || "UTC";
  const workDays = parseWorkDays(schedule.workDays);
  if (!isWorkDay(timestamp, tz, workDays)) return 0;
  const { startMin } = resolveWorkMinutesWindow(timestamp, tz, schedule);
  if (startMin == null) return 0;
  const nowMin = localMinutesFromDate(timestamp, tz);
  return Math.max(0, nowMin - startMin);
}

/**
 * CHECK_OUT timestamp 와 회사 스케줄로부터 초과근무 분을 계산.
 * 휴일이거나 정시 퇴근 이전이면 0.
 */
export function overtimeMinutesFor(
  timestamp: Date,
  timeZone: string,
  schedule: CompanyWorkSchedule
): number {
  const tz = timeZone.trim() || "UTC";
  const workDays = parseWorkDays(schedule.workDays);
  if (!isWorkDay(timestamp, tz, workDays)) return 0;
  const { endMin } = resolveWorkMinutesWindow(timestamp, tz, schedule);
  if (endMin == null) return 0;
  const nowMin = localMinutesFromDate(timestamp, tz);
  return Math.max(0, nowMin - endMin);
}

/**
 * "지금 퇴근하면 조퇴인가?"를 판정.
 * 회사 근무일이며 회사 타임존 기준 현재시각이 workEndTime 이전일 때만 true.
 */
export function isCheckOutEarly(
  timestamp: Date,
  timeZone: string,
  schedule: CompanyWorkSchedule
): boolean {
  const flags = evaluateAttendanceWorkFlags(timestamp, timeZone, "CHECK_OUT", schedule);
  return flags.isEarlyLeave;
}
