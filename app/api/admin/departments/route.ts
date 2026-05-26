import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const adminRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "SUPER_ADMIN"]);
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !adminRoles.has(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(session.user.role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  try {
    const departments = await prisma.department.findMany({
      where: { companyId: resolved.companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { employees: true } },
      },
    });

    return NextResponse.json({
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        employeeCount: d._count.employees,
      })),
      canEdit: editRoles.has(session.user.role ?? ""),
    });
  } catch (e) {
    console.error("[departments GET]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    if (
      message.includes("Unknown") ||
      message.includes("does not exist") ||
      message.includes("relation \"Department\"") ||
      message.includes("P2021") ||
      message.includes("P2022")
    ) {
      // DB 마이그레이션 미적용 — 빈 목록을 반환해 UI 가 깨지지 않게 함.
      // 사용자에게는 별도 안내 메시지가 admin 페이지에서 보임.
      return NextResponse.json({ departments: [], canEdit: false, schemaOutdated: true });
    }
    return NextResponse.json({ error: `부서 조회 실패: ${message}` }, { status: 500 });
  }
}

const postSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
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
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const dep = await prisma.department.create({
      data: { companyId: resolved.companyId, name: parsed.data.name },
      select: { id: true, name: true, createdAt: true },
    });
    return NextResponse.json({ department: { ...dep, employeeCount: 0 } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "DUPLICATE_NAME" }, { status: 409 });
    }
    console.error("[departments POST]", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
