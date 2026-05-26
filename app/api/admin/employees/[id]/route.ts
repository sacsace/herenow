import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
  /** null 로 보내면 부서 미배정 처리 */
  departmentId: z.string().min(1).max(40).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
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
    select: { companyId: true },
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

  try {
    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.departmentId !== undefined
          ? { departmentId: parsed.data.departmentId }
          : {}),
      },
      include: {
        user: { select: { email: true, role: true } },
        department: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ employee: updated });
  } catch (e) {
    console.error("[employees PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
