import { auth } from "@/auth";
import { calendarDayInTz } from "@/lib/adminMonthlyAttendance";
import { DEFAULT_COMPANY_TIMEZONE, recordDisplayTimezone } from "@/lib/companyTimezones";
import { lateMinutesFor, parseWorkDays } from "@/lib/companyWorkSchedule";
import { resolveEmployeeWorkSchedule } from "@/lib/employeeWorkSchedule";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function todayInTz(timeZone: string): string {
  return calendarDayInTz(new Date(), timeZone);
}

function enumerateDateStrings(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !ty) return out;
  const start = new Date(Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1));
  const end = new Date(Date.UTC(ty, (tm ?? 1) - 1, td ?? 1));
  while (start.getTime() <= end.getTime()) {
    const y = start.getUTCFullYear();
    const m = String(start.getUTCMonth() + 1).padStart(2, "0");
    const d = String(start.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return out;
}

function dateWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // local-independent weekday via UTC 정오 trick
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function clampInt(value: string | null, fallback: number, max: number): number {
  const n = Number(value ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role;
  if (
    role !== "COMPANY_ADMIN" &&
    role !== "HR_MANAGER" &&
    role !== "APPROVER" &&
    role !== "SUPER_ADMIN"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  let companyId = session.user.companyId;
  if (role === "SUPER_ADMIN") {
    const q = url.searchParams.get("companyId");
    if (!q) return NextResponse.json({ error: "companyId required" }, { status: 400 });
    companyId = q;
  }
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

  const fromQ = url.searchParams.get("from");
  const toQ = url.searchParams.get("to");
  if (!fromQ || !toQ || !DATE_ONLY.test(fromQ) || !DATE_ONLY.test(toQ)) {
    return NextResponse.json({ error: "from/to required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (toQ < fromQ) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }
  const departmentId = url.searchParams.get("departmentId") ?? null;
  const percentile = clampInt(url.searchParams.get("percentile"), 30, 100);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      timezone: true,
      workStartTime: true,
      workEndTime: true,
      workDays: true,
      workScheduleByDay: true,
      shiftPresets: true,
    },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const tz = company.timezone?.trim() || DEFAULT_COMPANY_TIMEZONE;
  const companySchedule = {
    workStartTime: company.workStartTime ?? null,
    workEndTime: company.workEndTime ?? null,
    workDays: company.workDays ?? null,
    workScheduleByDay: company.workScheduleByDay ?? null,
    shiftPresets: company.shiftPresets ?? null,
  };
  const defaultSchedule = {
    workStartTime: companySchedule.workStartTime,
    workEndTime: companySchedule.workEndTime,
    workDays: companySchedule.workDays,
    workScheduleByDay: companySchedule.workScheduleByDay,
  };
  const workDaySet = parseWorkDays(company.workDays);

  // 영업일 (오늘 이전까지) 산정
  const todayStr = todayInTz(tz);
  const allDates = enumerateDateStrings(fromQ, toQ);
  const businessDates = allDates.filter((d) => {
    if (d > todayStr) return false; // 미래 결근은 카운트 안함
    return workDaySet.has(dateWeekday(d));
  });
  const totalWorkdays = businessDates.length;

  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      ...(departmentId ? { departmentId } : {}),
    },
    select: {
      id: true,
      name: true,
      workScheduleType: true,
      shiftCode: true,
      workStartTime: true,
      workEndTime: true,
      workScheduleByDay: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const scheduleByEmployee = new Map(
    employees.map((e) => [e.id, resolveEmployeeWorkSchedule(e, companySchedule)])
  );

  if (employees.length === 0) {
    return NextResponse.json({
      timezone: tz,
      from: fromQ,
      to: toQ,
      totalWorkdays,
      workDays: [...workDaySet].sort(),
      thresholdRank: 0,
      percentile,
      issues: [],
    });
  }

  const empIds = employees.map((e) => e.id);

  // 출근/퇴근 기록 — from~to 범위에서 가져온다 (timestamp 기준으로 약간 폭을 넓혀 가져와도 OK)
  // 회사 타임존 경계 보정을 위해 ±1일 범위로 가져온 뒤 calendarDayInTz 로 정확히 day key 산정.
  const [fy, fm, fd] = fromQ.split("-").map(Number);
  const [ty, tm, td] = toQ.split("-").map(Number);
  const broadFrom = new Date(Date.UTC(fy!, (fm ?? 1) - 1, (fd ?? 1) - 1));
  const broadTo = new Date(Date.UTC(ty!, (tm ?? 1) - 1, (td ?? 1) + 1, 23, 59, 59));

  const records = await prisma.attendanceRecord.findMany({
    where: {
      companyId,
      employeeId: { in: empIds },
      timestamp: { gte: broadFrom, lte: broadTo },
    },
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      employeeId: true,
      type: true,
      timestamp: true,
      status: true,
      isLate: true,
      isEarlyLeave: true,
      lateMinutes: true,
      recordTimezone: true,
    },
  });

  // 직원 × 일자 상태 맵
  type DayState = {
    hasCheckIn: boolean;
    hasCheckOut: boolean;
    isLate: boolean;
    isEarlyLeave: boolean;
    lateMinutes: number;
  };
  const empDayState = new Map<string, Map<string, DayState>>();

  function ensure(empId: string, day: string): DayState {
    let m = empDayState.get(empId);
    if (!m) {
      m = new Map();
      empDayState.set(empId, m);
    }
    let s = m.get(day);
    if (!s) {
      s = {
        hasCheckIn: false,
        hasCheckOut: false,
        isLate: false,
        isEarlyLeave: false,
        lateMinutes: 0,
      };
      m.set(day, s);
    }
    return s;
  }

  for (const r of records) {
    const rt = recordDisplayTimezone(r, tz);
    const day = calendarDayInTz(r.timestamp, rt);
    if (day < fromQ || day > toQ) continue;
    if (!workDaySet.has(dateWeekday(day))) continue; // 휴일 근무는 이슈 집계에서 제외
    const state = ensure(r.employeeId, day);
    if (r.type === "CHECK_IN") {
      state.hasCheckIn = true;
      if (r.isLate) {
        state.isLate = true;
        const sched = scheduleByEmployee.get(r.employeeId) ?? defaultSchedule;
        const min = r.lateMinutes > 0 ? r.lateMinutes : lateMinutesFor(r.timestamp, rt, sched);
        if (min > state.lateMinutes) state.lateMinutes = min;
      }
    } else {
      state.hasCheckOut = true;
      if (r.isEarlyLeave) state.isEarlyLeave = true;
    }
  }

  // 직원별 집계
  type Issue = {
    employeeId: string;
    employeeName: string;
    departmentId: string | null;
    departmentName: string | null;
    lateDays: number;
    earlyLeaveDays: number;
    absentDays: number;
    incompleteDays: number;
    lateMinutesTotal: number;
    attendanceDays: number;
    workdays: number;
    score: number;
    isUnderPerformer: boolean;
  };

  const issues: Issue[] = employees.map((e) => {
    let lateDays = 0;
    let earlyLeaveDays = 0;
    let absentDays = 0;
    let incompleteDays = 0;
    let lateMinutesTotal = 0;
    let attendanceDays = 0;

    const days = empDayState.get(e.id);
    for (const day of businessDates) {
      const s = days?.get(day);
      if (!s || (!s.hasCheckIn && !s.hasCheckOut)) {
        absentDays += 1;
        continue;
      }
      attendanceDays += 1;
      if (s.isLate) {
        lateDays += 1;
        lateMinutesTotal += s.lateMinutes;
      }
      if (s.isEarlyLeave) earlyLeaveDays += 1;
      if (!s.hasCheckIn || !s.hasCheckOut) incompleteDays += 1;
    }

    // 점수: 결근(10) > 지각(3) ≈ 조퇴(3) > 미완료(2). 지각 누적 분 30 분당 +1.
    const score =
      absentDays * 10 +
      lateDays * 3 +
      earlyLeaveDays * 3 +
      incompleteDays * 2 +
      Math.floor(lateMinutesTotal / 30);

    return {
      employeeId: e.id,
      employeeName: e.name,
      departmentId: e.department?.id ?? null,
      departmentName: e.department?.name ?? null,
      lateDays,
      earlyLeaveDays,
      absentDays,
      incompleteDays,
      lateMinutesTotal,
      attendanceDays,
      workdays: totalWorkdays,
      score,
      isUnderPerformer: false,
    };
  });

  // 점수 내림차순 정렬 → 하위 percentile% (점수 큰 쪽이 "근태 안좋음")
  issues.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.absentDays !== a.absentDays) return b.absentDays - a.absentDays;
    if (b.lateDays !== a.lateDays) return b.lateDays - a.lateDays;
    return a.employeeName.localeCompare(b.employeeName, "ko");
  });

  // 하위 30% — score > 0 인 직원 중 상위 floor(N * 0.3) 명. 최소 1명.
  const positive = issues.filter((i) => i.score > 0);
  const thresholdRank = positive.length === 0
    ? 0
    : Math.max(1, Math.floor((employees.length * percentile) / 100));
  const cutoffIndex = Math.min(thresholdRank, positive.length);
  for (let i = 0; i < cutoffIndex; i++) {
    positive[i]!.isUnderPerformer = true;
  }

  return NextResponse.json({
    timezone: tz,
    from: fromQ,
    to: toQ,
    totalWorkdays,
    workDays: [...workDaySet].sort(),
    thresholdRank: cutoffIndex,
    percentile,
    issues,
  });
}
