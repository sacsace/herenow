import { auth } from "@/auth";
import {
  checkInErrorMessage,
  evaluatePunchEligibility,
  TWENTY_FOUR_H_MS,
} from "@/lib/attendancePunchRules";
import { DEFAULT_COMPANY_TIMEZONE } from "@/lib/companyTimezones";
import { evaluateAttendanceWorkFlags } from "@/lib/companyWorkSchedule";
import { resolveEmployeeWorkSchedule } from "@/lib/employeeWorkSchedule";
import {
  FACE_DESCRIPTOR_LENGTH,
  isFaceMatch,
  parseFaceDescriptor,
} from "@/lib/faceMatch";
import {
  enqueueMvsAttendanceIfEnabled,
  faceVerifiedForAttendance,
} from "@/lib/integrations/enqueueMvsAttendance";
import { prisma } from "@/lib/prisma";
import { mapSiteRow, resolvePunchSiteContext } from "@/lib/attendanceSiteContext";
import {
  checkGeofencePolicy,
  geofenceErrorMessage,
  parseGeofenceMode,
} from "@/lib/siteGeofence";
import { AttendanceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z
  .object({
    type: z.nativeEnum(AttendanceType),
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    accuracy: z.number().finite().optional(),
    memo: z.string().max(2000).optional(),
    isBusinessTrip: z.boolean().optional().default(false),
    businessTripLocation: z.string().trim().min(1).max(200).optional(),
    businessTripReason: z.string().trim().min(1).max(2000).optional(),
    /** 정규 퇴근 시각 이전 퇴근 시 필수 — 관리자 승인 대상 */
    earlyLeaveReason: z.string().trim().min(1).max(2000).optional(),
    photoUrl: z.string().max(2_000_000).optional().nullable(),
    deviceInfo: z.string().max(500).optional(),
    /** 출근 시 필수: 등록 얼굴과 일치 검증 */
    faceDescriptor: z.array(z.number().finite()).length(FACE_DESCRIPTOR_LENGTH).optional(),
    /** 출장·반경 밖 출퇴근 확인(WARN 모드) */
    acknowledgeGeofence: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.type === "CHECK_IN" && data.isBusinessTrip) {
      if (!data.businessTripReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "출장 사유를 입력해 주세요.",
          path: ["businessTripReason"],
        });
      }
    }
  });

/**
 * 출근/퇴근: 회사 geofenceMode에 따라 반경 밖 경고·차단. 출장 출근은 반경 검사 생략.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.employeeId) {
    return NextResponse.json({ error: "직원 프로필이 필요합니다." }, { status: 403 });
  }

  if (!session.user.companyId) {
    return NextResponse.json({ error: "회사 정보가 없습니다." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    type,
    latitude,
    longitude,
    accuracy,
    memo,
    isBusinessTrip,
    businessTripLocation,
    businessTripReason,
    earlyLeaveReason,
    photoUrl,
    deviceInfo,
    faceDescriptor,
    acknowledgeGeofence,
  } = parsed.data;

  const employee = await prisma.employee.findFirst({
    where: { id: session.user.employeeId, companyId: session.user.companyId },
    select: {
      id: true,
      departmentId: true,
      faceDescriptor: true,
      faceEnrolledAt: true,
      workScheduleType: true,
      shiftCode: true,
      workStartTime: true,
      workEndTime: true,
      workScheduleByDay: true,
    },
  });
  if (!employee) {
    return NextResponse.json({ error: "직원 정보가 올바르지 않습니다." }, { status: 403 });
  }

  const [company, lastRecord, sites] = await Promise.all([
    prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: {
        timezone: true,
        faceRecognitionEnabled: true,
        geofenceMode: true,
        workStartTime: true,
        workEndTime: true,
        workDays: true,
        workScheduleByDay: true,
        shiftPresets: true,
      },
    }),
    prisma.attendanceRecord.findFirst({
      where: { employeeId: employee.id, companyId: session.user.companyId },
      orderBy: { timestamp: "desc" },
      select: { type: true, timestamp: true },
    }),
    prisma.site.findMany({
      where: { companyId: session.user.companyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        allowedRadius: true,
        workScheduleMode: true,
        shiftCode: true,
        workStartTime: true,
        workEndTime: true,
        departments: { select: { departmentId: true } },
      },
    }),
  ]);

  if (!company) {
    return NextResponse.json({ error: "회사 정보를 찾을 수 없습니다." }, { status: 400 });
  }

  const tz = company.timezone?.trim() || DEFAULT_COMPANY_TIMEZONE;
  const now = new Date();

  const faceRequired = company.faceRecognitionEnabled;
  let faceMatched = false;

  // 안면 인식 검증 — 출근/퇴근 모두 동일 정책 적용
  if (faceRequired) {
    if (!employee.faceEnrolledAt) {
      return NextResponse.json(
        {
          error:
            type === "CHECK_IN"
              ? "출근 전 안면 등록이 필요합니다."
              : "퇴근 전 안면 등록이 필요합니다.",
        },
        { status: 400 }
      );
    }
    const probe = parseFaceDescriptor(faceDescriptor);
    const stored = parseFaceDescriptor(employee.faceDescriptor);
    if (!probe || !stored) {
      return NextResponse.json(
        { error: "안면 인식 정보가 없습니다. 다시 인식해 주세요." },
        { status: 400 }
      );
    }
    if (!isFaceMatch(stored, probe)) {
      return NextResponse.json(
        {
          error:
            type === "CHECK_IN"
              ? "등록된 얼굴과 일치하지 않습니다. 본인만 출근할 수 있습니다."
              : "등록된 얼굴과 일치하지 않습니다. 본인만 퇴근할 수 있습니다.",
        },
        { status: 403 }
      );
    }
    faceMatched = true;
  }

  if (type === "CHECK_IN") {
    const eligibility = evaluatePunchEligibility(
      now,
      tz,
      lastRecord ? { type: lastRecord.type, timestamp: lastRecord.timestamp } : null
    );

    if (!eligibility.canCheckIn) {
      const msg = checkInErrorMessage(eligibility.checkInBlock) ?? "출근할 수 없습니다.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } else {
    if (!lastRecord || lastRecord.type === "CHECK_OUT") {
      return NextResponse.json({ error: "먼저 출근해 주세요." }, { status: 400 });
    }
    const elapsed = now.getTime() - lastRecord.timestamp.getTime();
    if (elapsed > TWENTY_FOUR_H_MS) {
      return NextResponse.json(
        { error: "출근 시점부터 24시간이 지나 퇴근할 수 없습니다. 관리자에게 문의해 주세요." },
        { status: 400 }
      );
    }
  }

  const ua = req.headers.get("user-agent") ?? "";
  const mergedDevice = deviceInfo?.trim() || ua.slice(0, 500);

  const skipSiteLink = isBusinessTrip && type === "CHECK_IN";
  const siteRows = sites.map(mapSiteRow);
  const siteCtx = resolvePunchSiteContext(
    siteRows,
    employee.departmentId,
    latitude,
    longitude,
    skipSiteLink
  );

  const geofenceMode = parseGeofenceMode(company.geofenceMode);
  const geofence = checkGeofencePolicy(
    geofenceMode,
    siteCtx.nearestSite,
    latitude,
    longitude,
    { skip: skipSiteLink, acknowledgeGeofence }
  );

  if (geofence.action === "block") {
    return NextResponse.json(
      {
        error: geofenceErrorMessage(geofence.distanceMeters, geofence.allowedRadius),
        code: "GEOFENCE_BLOCKED",
        siteName: geofence.siteName,
        distanceMeters: geofence.distanceMeters,
        allowedRadius: geofence.allowedRadius,
      },
      { status: 400 }
    );
  }

  if (geofence.action === "warn") {
    return NextResponse.json(
      {
        error: geofenceErrorMessage(geofence.distanceMeters, geofence.allowedRadius),
        code: "GEOFENCE_WARNING",
        siteName: geofence.siteName,
        distanceMeters: geofence.distanceMeters,
        allowedRadius: geofence.allowedRadius,
      },
      { status: 409 }
    );
  }

  const effectiveSchedule = resolveEmployeeWorkSchedule(
    employee,
    company,
    siteCtx.nearestSite
  );
  const workFlags = evaluateAttendanceWorkFlags(now, tz, type, effectiveSchedule);

  const siteId = siteCtx.siteId;
  const distanceFromSite = siteCtx.distanceFromSite;
  const outsideGeofence = geofence.outsideGeofence;

  // 조퇴(정규 퇴근시각 이전 퇴근) 인 경우 사유 필수 + 관리자 승인 대상으로 처리
  const earlyLeavePending = type === "CHECK_OUT" && workFlags.isEarlyLeave;
  const trimmedEarlyReason = earlyLeaveReason?.trim() || null;
  if (earlyLeavePending && !trimmedEarlyReason) {
    return NextResponse.json(
      {
        error: "조퇴 사유가 필요합니다. 사유를 입력하면 관리자 승인 후 처리됩니다.",
        code: "EARLY_LEAVE_REASON_REQUIRED",
      },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.attendanceRecord.create({
      data: {
        company: { connect: { id: session.user.companyId! } },
        employee: { connect: { id: employee.id } },
        ...(siteId ? { site: { connect: { id: siteId } } } : {}),
        type,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        distanceFromSite,
        outsideGeofence,
        // 조퇴 시 PENDING — 관리자 승인 후 APPROVED 로 전환
        status: earlyLeavePending ? "PENDING" : "APPROVED",
        memo: memo?.trim() || null,
        isBusinessTrip: type === "CHECK_IN" ? isBusinessTrip : false,
        businessTripLocation:
          type === "CHECK_IN" && isBusinessTrip ? businessTripLocation?.trim() || null : null,
        businessTripReason:
          type === "CHECK_IN" && isBusinessTrip ? businessTripReason!.trim() : null,
        photoUrl: photoUrl?.trim() || null,
        deviceInfo: mergedDevice || null,
        isLate: workFlags.isLate,
        isEarlyLeave: workFlags.isEarlyLeave,
        isOvertime: workFlags.isOvertime,
        isHolidayWork: workFlags.isHolidayWork,
        lateMinutes: workFlags.lateMinutes,
        overtimeMinutes: workFlags.overtimeMinutes,
        recordTimezone: tz,
      },
      include: { site: { select: { name: true } } },
    });

    let exceptionId: string | null = null;
    if (earlyLeavePending && trimmedEarlyReason) {
      const ex = await tx.attendanceException.create({
        data: {
          companyId: session.user.companyId!,
          attendanceId: record.id,
          reason: trimmedEarlyReason,
          status: "PENDING",
        },
        select: { id: true },
      });
      exceptionId = ex.id;
    }

    return { record, exceptionId };
  });

  void enqueueMvsAttendanceIfEnabled(
    result.record.id,
    faceVerifiedForAttendance(type, faceRequired, faceMatched)
  );

  return NextResponse.json({
    id: result.record.id,
    status: result.record.status,
    distanceFromSite: result.record.distanceFromSite,
    outsideGeofence: result.record.outsideGeofence,
    siteName: result.record.site?.name ?? null,
    isBusinessTrip: result.record.isBusinessTrip,
    businessTripLocation: result.record.businessTripLocation,
    type: result.record.type,
    isLate: result.record.isLate,
    isEarlyLeave: result.record.isEarlyLeave,
    isOvertime: result.record.isOvertime,
    isHolidayWork: result.record.isHolidayWork,
    lateMinutes: result.record.lateMinutes,
    overtimeMinutes: result.record.overtimeMinutes,
    exceptionId: result.exceptionId,
    pendingApproval: earlyLeavePending,
    message: earlyLeavePending
      ? "조퇴 요청이 접수되었습니다. 관리자 승인 후 확정됩니다."
      : outsideGeofence
        ? "근무지 반경 밖에서 기록되었습니다."
        : "정상 처리되었습니다.",
  });
}
