import { auth } from "@/auth";
import { aggregateAttendanceByDay, filterAttendanceDayRows } from "@/lib/adminAttendanceByDay";
import { DEFAULT_COMPANY_TIMEZONE, recordDisplayTimezone } from "@/lib/companyTimezones";
import { lateMinutesFor, overtimeMinutesFor } from "@/lib/companyWorkSchedule";
import { resolveEmployeeWorkSchedule } from "@/lib/employeeWorkSchedule";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

  const employeeId = url.searchParams.get("employeeId") ?? undefined;
  const departmentId = url.searchParams.get("departmentId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200") || 200, 500);

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
  const employeeSchedules = await prisma.employee.findMany({
    where: { companyId },
    select: {
      id: true,
      workScheduleType: true,
      shiftCode: true,
      workStartTime: true,
      workEndTime: true,
      workScheduleByDay: true,
    },
  });
  const scheduleByEmployee = new Map(
    employeeSchedules.map((e) => [e.id, resolveEmployeeWorkSchedule(e, companySchedule)])
  );

  const records = await prisma.attendanceRecord.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      // 부서 필터 — 해당 부서 소속 직원의 기록만
      ...(departmentId ? { employee: { departmentId } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: 5000,
    include: {
      employee: { select: { name: true } },
      site: { select: { name: true } },
    },
  });

  // 마이그레이션 이전 기록 보정 — isLate/isOvertime 만 있고 분 정보가 0 이면 회사 스케줄로 즉석 계산
  const augmented = records.map((r) => {
    let lateMinutes = r.lateMinutes;
    let overtimeMinutes = r.overtimeMinutes;
    const rt = recordDisplayTimezone(r, tz);
    const sched = scheduleByEmployee.get(r.employeeId) ?? defaultSchedule;
    if (r.type === "CHECK_IN" && r.isLate && lateMinutes <= 0) {
      lateMinutes = lateMinutesFor(r.timestamp, rt, sched);
    }
    if (r.type === "CHECK_OUT" && r.isOvertime && overtimeMinutes <= 0) {
      overtimeMinutes = overtimeMinutesFor(r.timestamp, rt, sched);
    }
    return { ...r, lateMinutes, overtimeMinutes };
  });

  const days = filterAttendanceDayRows(
    aggregateAttendanceByDay(augmented, tz, status || undefined),
    { from, to, q }
  ).slice(0, limit);

  return NextResponse.json({ timezone: tz, days });
}
