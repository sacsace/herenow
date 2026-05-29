import { auth } from "@/auth";
import { employeeScheduleSummary } from "@/lib/employeeWorkSchedule";
import { normalizeWorkScheduleByDay } from "@/lib/companyWorkSchedule";
import { prisma } from "@/lib/prisma";
import { isShiftCode } from "@/lib/employeeWorkSchedule";
import { canAssignRole, canDeleteEmployee } from "@/lib/roleHierarchy";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

const editRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "SUPER_ADMIN"]);

const COMPANY_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "EMPLOYEE"] as const;

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

const patchSchema = z.object({
  /** null 로 보내면 부서 미배정 처리 */
  departmentId: z.string().min(1).max(40).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().transform((e) => e.toLowerCase().trim()).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(COMPANY_ROLES).optional(),
  workScheduleType: z.enum(["COMPANY", "SHIFT", "CUSTOM"]).optional(),
  shiftCode: z.enum(["A", "B", "C"]).nullable().optional(),
  workStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  workEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  workScheduleByDay: z
    .record(
      z.string().regex(/^[0-6]$/),
      z.object({
        workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      })
    )
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !editRoles.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(session.user.role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { id } = await ctx.params;

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

  // 회사 격리 — 같은 회사 소속이 아니면 거부
  const existing = await prisma.employee.findUnique({
    where: { id },
    select: {
      companyId: true,
      userId: true,
      user: { select: { id: true, role: true, email: true } },
    },
  });
  if (!existing || existing.companyId !== resolved.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 부서가 들어왔다면 같은 회사 소속인지 검증
  if (parsed.data.departmentId !== undefined && parsed.data.departmentId !== null) {
    const dep = await prisma.department.findUnique({
      where: { id: parsed.data.departmentId },
      select: { companyId: true },
    });
    if (!dep || dep.companyId !== resolved.companyId) {
      return NextResponse.json({ error: "INVALID_DEPARTMENT" }, { status: 400 });
    }
  }

  // 역할 변경 권한 체크 — 호출자보다 엄격히 낮은 등급만 허용
  const wantsRoleChange =
    parsed.data.role !== undefined && parsed.data.role !== existing.user.role;
  if (wantsRoleChange) {
    if (
      !canAssignRole(session.user.role, existing.user.role, parsed.data.role!)
    ) {
      return NextResponse.json(
        { error: "ROLE_NOT_ALLOWED", message: "권한이 부족하거나 허용되지 않는 역할입니다." },
        { status: 403 }
      );
    }
    // 자기 자신의 역할을 본인이 변경하지 못하도록 안전망 (회사 관리자가 자기 자신을 강등하면 잠금)
    if (existing.user.id === session.user.id) {
      return NextResponse.json(
        { error: "CANNOT_CHANGE_OWN_ROLE", message: "본인의 역할은 변경할 수 없습니다." },
        { status: 403 }
      );
    }
  }

  const wantsEmailChange =
    parsed.data.email !== undefined && parsed.data.email !== existing.user.email;

  if (wantsEmailChange) {
    const taken = await prisma.user.findUnique({
      where: { email: parsed.data.email! },
      select: { id: true },
    });
    if (taken && taken.id !== existing.userId) {
      return NextResponse.json(
        { error: "EMAIL_TAKEN", message: "이미 등록된 이메일입니다." },
        { status: 409 }
      );
    }
  }

  const wantsPasswordChange = parsed.data.password !== undefined;

  const schedulePatch: Prisma.EmployeeUpdateInput = {};

  if (parsed.data.workScheduleType !== undefined) {
    schedulePatch.workScheduleType = parsed.data.workScheduleType;
    if (parsed.data.workScheduleType === "COMPANY") {
      schedulePatch.shiftCode = null;
      schedulePatch.workStartTime = null;
      schedulePatch.workEndTime = null;
      schedulePatch.workScheduleByDay = Prisma.JsonNull;
    } else if (parsed.data.workScheduleType === "SHIFT") {
      const code = parsed.data.shiftCode;
      if (!code || !isShiftCode(code)) {
        return NextResponse.json({ error: "SHIFT_CODE_REQUIRED" }, { status: 400 });
      }
      schedulePatch.shiftCode = code;
      schedulePatch.workStartTime = null;
      schedulePatch.workEndTime = null;
      schedulePatch.workScheduleByDay = Prisma.JsonNull;
    } else if (parsed.data.workScheduleType === "CUSTOM") {
      schedulePatch.shiftCode = null;
      if (parsed.data.workStartTime !== undefined) {
        schedulePatch.workStartTime = parsed.data.workStartTime;
      }
      if (parsed.data.workEndTime !== undefined) {
        schedulePatch.workEndTime = parsed.data.workEndTime;
      }
      if (parsed.data.workScheduleByDay !== undefined) {
        schedulePatch.workScheduleByDay =
          parsed.data.workScheduleByDay === null
            ? Prisma.JsonNull
            : (normalizeWorkScheduleByDay(parsed.data.workScheduleByDay) as Prisma.InputJsonValue);
      }
    }
  } else if (parsed.data.shiftCode !== undefined) {
    if (parsed.data.shiftCode && !isShiftCode(parsed.data.shiftCode)) {
      return NextResponse.json({ error: "INVALID_SHIFT_CODE" }, { status: 400 });
    }
    schedulePatch.shiftCode = parsed.data.shiftCode;
  }

  const employeeData: Prisma.EmployeeUpdateInput = {
    ...schedulePatch,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
  };

  if (parsed.data.departmentId !== undefined) {
    employeeData.department = parsed.data.departmentId
      ? { connect: { id: parsed.data.departmentId } }
      : { disconnect: true };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: employeeData,
        include: {
          user: { select: { id: true, email: true, role: true } },
          department: { select: { id: true, name: true } },
        },
      });

      let userEmail = employee.user.email;
      let userRole = employee.user.role;

      const userUpdates: { email?: string; passwordHash?: string; role?: Role } = {};
      if (wantsEmailChange) userUpdates.email = parsed.data.email;
      if (wantsPasswordChange) {
        userUpdates.passwordHash = await bcrypt.hash(parsed.data.password!, 10);
      }
      if (wantsRoleChange) userUpdates.role = parsed.data.role as Role;

      if (Object.keys(userUpdates).length > 0) {
        const updatedUser = await tx.user.update({
          where: { id: existing.userId },
          data: userUpdates,
          select: { email: true, role: true },
        });
        userEmail = updatedUser.email;
        userRole = updatedUser.role;
      }

      if (wantsRoleChange) {
        await tx.approvalLog.create({
          data: {
            companyId: resolved.companyId,
            approverId: session.user.id!,
            action: "USER_ROLE_CHANGE",
            targetType: "User",
            targetId: existing.userId,
          },
        });
      }
      if (wantsEmailChange) {
        await tx.approvalLog.create({
          data: {
            companyId: resolved.companyId,
            approverId: session.user.id!,
            action: "USER_EMAIL_CHANGE",
            targetType: "User",
            targetId: existing.userId,
          },
        });
      }
      if (wantsPasswordChange) {
        await tx.approvalLog.create({
          data: {
            companyId: resolved.companyId,
            approverId: session.user.id!,
            action: "USER_PASSWORD_RESET",
            targetType: "User",
            targetId: existing.userId,
          },
        });
      }

      const company = await tx.company.findUnique({
        where: { id: resolved.companyId },
        select: {
          workStartTime: true,
          workEndTime: true,
          workDays: true,
          workScheduleByDay: true,
          shiftPresets: true,
        },
      });
      const scheduleSummary = company
        ? employeeScheduleSummary(employee, company, "ko").label
        : "";

      return {
        ...employee,
        user: { ...employee.user, email: userEmail, role: userRole },
        scheduleSummary,
      };
    });

    return NextResponse.json({ employee: result });
  } catch (e) {
    console.error("[employees PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !editRoles.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(session.user.role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { id } = await ctx.params;

  const existing = await prisma.employee.findUnique({
    where: { id },
    select: {
      companyId: true,
      userId: true,
      name: true,
      user: { select: { id: true, role: true } },
    },
  });
  if (!existing || existing.companyId !== resolved.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.user.id === session.user.id) {
    return NextResponse.json(
      { error: "CANNOT_DELETE_SELF", message: "본인 계정은 삭제할 수 없습니다." },
      { status: 403 }
    );
  }

  if (!canDeleteEmployee(session.user.role, existing.user.role, false)) {
    return NextResponse.json(
      { error: "ROLE_NOT_ALLOWED", message: "권한이 부족하거나 삭제할 수 없는 사용자입니다." },
      { status: 403 }
    );
  }

  if (existing.user.role === "COMPANY_ADMIN") {
    const adminCount = await prisma.user.count({
      where: { companyId: resolved.companyId, role: "COMPANY_ADMIN" },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        {
          error: "LAST_ADMIN",
          message: "마지막 회사 관리자는 삭제할 수 없습니다. 다른 관리자를 먼저 지정해 주세요.",
        },
        { status: 403 }
      );
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.approvalLog.create({
        data: {
          companyId: resolved.companyId,
          approverId: session.user.id!,
          action: "USER_DELETE",
          targetType: "User",
          targetId: existing.userId,
        },
      });
      // Employee·출퇴근 기록 등은 User/Employee onDelete Cascade 로 정리됨
      await tx.user.delete({ where: { id: existing.userId } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[employees DELETE]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
