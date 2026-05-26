import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const editRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "SUPER_ADMIN"]);

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
  name: z.string().trim().min(1).max(80),
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

  // 회사 격리: 같은 회사 소속이 아니면 거부
  const existing = await prisma.department.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing || existing.companyId !== resolved.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const dep = await prisma.department.update({
      where: { id },
      data: { name: parsed.data.name },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { employees: true } },
      },
    });
    return NextResponse.json({
      department: {
        id: dep.id,
        name: dep.name,
        createdAt: dep.createdAt,
        employeeCount: dep._count.employees,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "DUPLICATE_NAME" }, { status: 409 });
    }
    console.error("[departments PATCH]", e);
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

  const existing = await prisma.department.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing || existing.companyId !== resolved.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // onDelete: SetNull — 직원의 departmentId 는 자동으로 null
    await prisma.department.delete({ where: { id } });
  } catch (e) {
    console.error("[departments DELETE]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
