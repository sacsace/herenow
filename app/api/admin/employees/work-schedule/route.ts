import { auth } from "@/auth";
import { normalizeWorkScheduleByDay } from "@/lib/companyWorkSchedule";
import { isShiftCode } from "@/lib/employeeWorkSchedule";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const editRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "SUPER_ADMIN"]);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const bulkSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500),
  workScheduleType: z.enum(["COMPANY", "SHIFT", "CUSTOM"]),
  shiftCode: z.enum(["A", "B", "C"]).optional(),
  workStartTime: hhmm.optional(),
  workEndTime: hhmm.optional(),
});

/** 직원 근무시간 일괄 적용 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !editRoles.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let companyId = session.user.companyId;
  if (session.user.role === "SUPER_ADMIN") {
    const q = new URL(req.url).searchParams.get("companyId");
    if (!q) return NextResponse.json({ error: "companyId required" }, { status: 400 });
    companyId = q;
  }
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { employeeIds, workScheduleType, shiftCode, workStartTime, workEndTime } = parsed.data;

  if (workScheduleType === "SHIFT") {
    if (!shiftCode || !isShiftCode(shiftCode)) {
      return NextResponse.json({ error: "SHIFT_CODE_REQUIRED" }, { status: 400 });
    }
  }
  if (workScheduleType === "CUSTOM" && (!workStartTime || !workEndTime)) {
    return NextResponse.json({ error: "CUSTOM_TIMES_REQUIRED" }, { status: 400 });
  }

  const count = await prisma.employee.count({
    where: { companyId, id: { in: employeeIds } },
  });
  if (count !== employeeIds.length) {
    return NextResponse.json({ error: "INVALID_EMPLOYEES" }, { status: 400 });
  }

  const data =
    workScheduleType === "COMPANY"
      ? {
          workScheduleType: "COMPANY",
          shiftCode: null,
          workStartTime: null,
          workEndTime: null,
          workScheduleByDay: null,
        }
      : workScheduleType === "SHIFT"
        ? {
            workScheduleType: "SHIFT",
            shiftCode: shiftCode!,
            workStartTime: null,
            workEndTime: null,
            workScheduleByDay: null,
          }
        : {
            workScheduleType: "CUSTOM",
            shiftCode: null,
            workStartTime: workStartTime!,
            workEndTime: workEndTime!,
            workScheduleByDay: null,
          };

  const result = await prisma.employee.updateMany({
    where: { companyId, id: { in: employeeIds } },
    data,
  });

  return NextResponse.json({ updated: result.count });
}
