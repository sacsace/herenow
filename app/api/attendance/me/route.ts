import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COMPANY_TIMEZONE, recordDisplayTimezone } from "@/lib/companyTimezones";
import { lateMinutesFor, overtimeMinutesFor } from "@/lib/companyWorkSchedule";
import { resolveEmployeeWorkSchedule } from "@/lib/employeeWorkSchedule";
import { NextResponse } from "next/server";

/** 본인 출퇴근 기록 (테넌트 + 본인 employee만) */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.employeeId || !session.user.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("limit") ?? "50") || 50, 200);

    const [company, employee, rows] = await Promise.all([
      prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: {
          timezone: true,
          workStartTime: true,
          workEndTime: true,
          workDays: true,
          workScheduleByDay: true,
          shiftPresets: true,
        },
      }),
      prisma.employee.findFirst({
        where: { id: session.user.employeeId, companyId: session.user.companyId },
        select: {
          workScheduleType: true,
          shiftCode: true,
          workStartTime: true,
          workEndTime: true,
          workScheduleByDay: true,
        },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          companyId: session.user.companyId,
          employeeId: session.user.employeeId,
        },
        orderBy: { timestamp: "desc" },
        take,
        include: {
          site: { select: { name: true } },
          exception: { select: { id: true, status: true, reason: true } },
        },
      }),
    ]);

    const tz = company?.timezone?.trim() || DEFAULT_COMPANY_TIMEZONE;
    const schedule =
      company && employee
        ? resolveEmployeeWorkSchedule(employee, company)
        : {
            workStartTime: company?.workStartTime ?? null,
            workEndTime: company?.workEndTime ?? null,
            workDays: company?.workDays ?? null,
            workScheduleByDay: company?.workScheduleByDay ?? null,
          };

    // 마이그레이션 이전 기록 — lateMinutes/overtimeMinutes 가 0 인데 isLate/isOvertime 만 true 인 경우
    // 회사 스케줄로 지각/초과 분을 즉석 계산해 보정한다.
    const augmented = rows.map((r) => {
      let lateMinutes = r.lateMinutes;
      let overtimeMinutes = r.overtimeMinutes;
      const rt = recordDisplayTimezone(r, tz);
      if (r.type === "CHECK_IN" && r.isLate && lateMinutes <= 0) {
        lateMinutes = lateMinutesFor(r.timestamp, rt, schedule);
      }
      if (r.type === "CHECK_OUT" && r.isOvertime && overtimeMinutes <= 0) {
        overtimeMinutes = overtimeMinutesFor(r.timestamp, rt, schedule);
      }
      return { ...r, lateMinutes, overtimeMinutes };
    });

    return NextResponse.json({ timezone: tz, records: augmented });
  } catch (e) {
    console.error("[attendance/me GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
