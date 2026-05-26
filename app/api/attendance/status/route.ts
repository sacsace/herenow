import { auth } from "@/auth";
import {
  calendarDayInTz,
  checkInErrorMessage,
  evaluatePunchEligibility,
} from "@/lib/attendancePunchRules";
import { isCheckOutEarly } from "@/lib/companyWorkSchedule";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.employeeId || !session.user.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: {
      timezone: true,
      workStartTime: true,
      workEndTime: true,
      workDays: true,
    },
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tz = company.timezone?.trim() || "Asia/Seoul";
  const now = new Date();

  const lastRecord = await prisma.attendanceRecord.findFirst({
    where: {
      employeeId: session.user.employeeId,
      companyId: session.user.companyId,
    },
    orderBy: { timestamp: "desc" },
    select: { type: true, timestamp: true },
  });

  const eligibility = evaluatePunchEligibility(
    now,
    tz,
    lastRecord ? { type: lastRecord.type, timestamp: lastRecord.timestamp } : null
  );

  // "지금 퇴근하면 조퇴인가?" — 클라이언트가 사유 입력 UI 를 노출할지 결정
  const earlyLeaveExpected =
    eligibility.canCheckOut &&
    isCheckOutEarly(now, tz, {
      workStartTime: company.workStartTime,
      workEndTime: company.workEndTime,
      workDays: company.workDays,
    });

  return NextResponse.json({
    ...eligibility,
    checkInMessage: checkInErrorMessage(eligibility.checkInBlock),
    lastType: lastRecord?.type ?? null,
    lastTimestamp: lastRecord?.timestamp.toISOString() ?? null,
    today: calendarDayInTz(now, tz),
    earlyLeaveExpected,
    workEndTime: company.workEndTime,
  });
}
