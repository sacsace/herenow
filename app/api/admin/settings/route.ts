import { auth } from "@/auth";
import { DEFAULT_COMPANY_TIMEZONE, isValidIanaTimezone } from "@/lib/companyTimezones";
import {
  formatWorkDays,
  normalizeWorkScheduleByDay,
  parseWorkDays,
  type WorkScheduleByDay,
} from "@/lib/companyWorkSchedule";
import { parseHHmm } from "@/lib/attendanceRules";
import { normalizeShiftPresets, type ShiftPresetsMap } from "@/lib/shiftPresets";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

function resolveCompanyId(
  role: string | undefined,
  sessionCompanyId: string | null | undefined,
  url: URL
): { companyId: string } | { error: string; status: number } {
  if (role === "SUPER_ADMIN") {
    const q = url.searchParams.get("companyId");
    if (!q) return { error: "companyId required", status: 400 };
    return { companyId: q };
  }
  if (!sessionCompanyId) return { error: "No company", status: 400 };
  return { companyId: sessionCompanyId };
}

const adminRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "SUPER_ADMIN"]);
const editRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "SUPER_ADMIN"]);

const companySelect = {
  id: true,
  name: true,
  timezone: true,
  faceRecognitionEnabled: true,
  workStartTime: true,
  workEndTime: true,
  workDays: true,
  workScheduleByDay: true,
  shiftPresets: true,
  geofenceMode: true,
} as const;

function settingsPayload(
  company: {
    id: string;
    name: string;
    timezone: string;
    faceRecognitionEnabled: boolean;
    workStartTime: string | null;
    workEndTime: string | null;
    workDays: string | null;
    workScheduleByDay: unknown;
    shiftPresets: unknown;
    geofenceMode: string;
  },
  canEdit: boolean
) {
  return {
    companyId: company.id,
    companyName: company.name,
    timezone: company.timezone?.trim() || DEFAULT_COMPANY_TIMEZONE,
    faceRecognitionEnabled: company.faceRecognitionEnabled,
    workStartTime: company.workStartTime,
    workEndTime: company.workEndTime,
    workDays: company.workDays,
    workDaysArray: [...parseWorkDays(company.workDays)].sort((a, b) => a - b),
    workScheduleByDay: normalizeWorkScheduleByDay(company.workScheduleByDay),
    shiftPresets: normalizeShiftPresets(company.shiftPresets),
    geofenceMode: company.geofenceMode?.trim() || "OFF",
    canEdit,
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !adminRoles.has(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolved = resolveCompanyId(session.user.role, session.user.companyId, new URL(req.url));
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const company = await prisma.company.findUnique({
      where: { id: resolved.companyId },
      select: companySelect,
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(settingsPayload(company, editRoles.has(session.user.role ?? "")));
  } catch (e) {
    console.error("[admin/settings GET]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json(
      {
        error:
          message.includes("Unknown field") || message.includes("does not exist")
            ? "DB 스키마가 최신이 아닙니다. 서버를 중지한 뒤 npx prisma migrate deploy && npx prisma generate 후 다시 실행해 주세요."
            : `설정 조회 실패: ${message}`,
      },
      { status: 500 }
    );
  }
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const workWindowSchema = z
  .object({
    workStartTime: hhmm,
    workEndTime: hhmm,
  })
  .refine((v) => (parseHHmm(v.workStartTime) ?? 0) < (parseHHmm(v.workEndTime) ?? 0), {
    message: "퇴근 시각은 출근 시각보다 늦어야 합니다.",
    path: ["workEndTime"],
  });

const shiftPresetSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    workStartTime: hhmm,
    workEndTime: hhmm,
  })
  .refine(
    (v) => (parseHHmm(v.workStartTime) ?? -1) !== (parseHHmm(v.workEndTime) ?? -2),
    { message: "출·퇴근 시각이 같을 수 없습니다.", path: ["workEndTime"] }
  );

const patchSchema = z
  .object({
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((s) => isValidIanaTimezone(s), {
        message: "유효한 IANA 타임존을 선택해 주세요.",
      })
      .optional(),
    faceRecognitionEnabled: z.boolean().optional(),
    workStartTime: hhmm.nullable().optional(),
    workEndTime: hhmm.nullable().optional(),
    workDays: z
      .string()
      .max(30)
      .optional()
      .refine((s) => s === undefined || parseWorkDays(s).size > 0, {
        message: "근무 요일을 하나 이상 선택해 주세요.",
      }),
    workScheduleByDay: z.record(z.string().regex(/^[0-6]$/), workWindowSchema).optional(),
    shiftPresets: z
      .record(z.enum(["A", "B", "C"]), shiftPresetSchema)
      .optional(),
    geofenceMode: z.enum(["OFF", "WARN", "BLOCK"]).optional(),
  })
  .refine(
    (data) => {
      if (data.workStartTime == null || data.workEndTime == null) return true;
      if (data.workStartTime === undefined || data.workEndTime === undefined) return true;
      const a = parseHHmm(data.workStartTime);
      const b = parseHHmm(data.workEndTime);
      if (a == null || b == null) return true;
      return a < b;
    },
    { message: "퇴근 시각은 출근 시각보다 늦어야 합니다.", path: ["workEndTime"] }
  );

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !editRoles.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(session.user.role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Prisma.CompanyUpdateInput = {};

  if (parsed.data.timezone !== undefined) {
    data.timezone = parsed.data.timezone.trim();
  }
  if (parsed.data.faceRecognitionEnabled !== undefined) {
    data.faceRecognitionEnabled = parsed.data.faceRecognitionEnabled;
  }
  if (parsed.data.workStartTime !== undefined) {
    data.workStartTime = parsed.data.workStartTime;
  }
  if (parsed.data.workEndTime !== undefined) {
    data.workEndTime = parsed.data.workEndTime;
  }
  if (parsed.data.workDays !== undefined) {
    data.workDays = formatWorkDays(parseWorkDays(parsed.data.workDays));
  }
  if (parsed.data.workScheduleByDay !== undefined) {
    const normalized = normalizeWorkScheduleByDay(parsed.data.workScheduleByDay);
    const json: Record<string, { workStartTime: string; workEndTime: string }> = {};
    for (const [day, window] of Object.entries(normalized as WorkScheduleByDay)) {
      if (!window) continue;
      json[day] = {
        workStartTime: window.workStartTime,
        workEndTime: window.workEndTime,
      };
    }
    data.workScheduleByDay = json as Prisma.InputJsonValue;
  }
  if (parsed.data.shiftPresets !== undefined) {
    const normalized = normalizeShiftPresets(parsed.data.shiftPresets);
    const json: ShiftPresetsMap = normalized;
    data.shiftPresets = json as Prisma.InputJsonValue;
  }
  if (parsed.data.geofenceMode !== undefined) {
    data.geofenceMode = parsed.data.geofenceMode;
  }

  const company = await prisma.company.update({
    where: { id: resolved.companyId },
    data,
    select: companySelect,
  });

  return NextResponse.json(settingsPayload(company, true));
}
