import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * 회사 소속 사용자에게 할당 가능한 역할만 허용한다.
 * SUPER_ADMIN 은 companyId 가 null 이어야 하므로 여기선 명시적으로 제외.
 */
const COMPANY_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "EMPLOYEE"] as const;

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    role: z.enum(COMPANY_ROLES).optional(),
  })
  .refine((d) => d.name !== undefined || d.role !== undefined, {
    message: "Provide at least one field to update",
  });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: companyId, userId } = await ctx.params;

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

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true, role: true, employee: { select: { id: true, name: true } } },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 표시 이름 업데이트는 Employee 레코드가 있어야 함
  if (parsed.data.name !== undefined && !user.employee) {
    return NextResponse.json({ error: "Employee record not found" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let updatedRole = user.role;
      if (parsed.data.role !== undefined && parsed.data.role !== user.role) {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { role: parsed.data.role as Role },
          select: { role: true },
        });
        updatedRole = updated.role;
        await tx.approvalLog.create({
          data: {
            companyId,
            approverId: session.user.id,
            action: "USER_ROLE_CHANGE",
            targetType: "User",
            targetId: user.id,
          },
        });
      }

      let updatedName = user.employee?.name ?? null;
      if (parsed.data.name !== undefined && user.employee) {
        const next = parsed.data.name.trim();
        if (next && next !== user.employee.name) {
          const updated = await tx.employee.update({
            where: { id: user.employee.id },
            data: { name: next },
            select: { name: true },
          });
          updatedName = updated.name;
        }
      }

      return { updatedRole, updatedName };
    });

    return NextResponse.json({
      employee: user.employee
        ? { id: user.employee.id, name: result.updatedName ?? user.employee.name }
        : null,
      user: { id: user.id, role: result.updatedRole },
    });
  } catch (e) {
    console.error("[super users PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: companyId, userId } = await ctx.params;

  // 자기 자신은 이 페이지에서 다루는 회사 사용자(SUPER_ADMIN은 companyId가 null)
  // 가 아니지만 안전망으로 추가 차단한다.
  if (session.user.id === userId) {
    return NextResponse.json(
      { error: "본인 계정은 삭제할 수 없습니다." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // User → Employee → AttendanceRecord, ApprovalLog 등은 onDelete: Cascade 로 자동 정리.
  await prisma.user.delete({ where: { id: target.id } });

  return NextResponse.json({ ok: true });
}
