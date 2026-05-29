import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeShiftPresets } from "@/lib/shiftPresets";
import { canAssignRole } from "@/lib/roleHierarchy";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

const COMPANY_ROLES = ["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "EMPLOYEE"] as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (
    role !== "COMPANY_ADMIN" &&
    role !== "HR_MANAGER" &&
    role !== "APPROVER" &&
    role !== "SUPER_ADMIN"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let companyId = session.user.companyId;
  if (role === "SUPER_ADMIN") {
    const q = new URL(req.url).searchParams.get("companyId");
    if (!q) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }
    companyId = q;
  }

  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 400 });
  }

  try {
    const [company, employees] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          workStartTime: true,
          workEndTime: true,
          workDays: true,
          workScheduleByDay: true,
          shiftPresets: true,
        },
      }),
      prisma.employee.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        include: {
          user: { select: { id: true, email: true, role: true } },
          department: { select: { id: true, name: true } },
        },
      }),
    ]);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    const companySchedule = {
      workStartTime: company.workStartTime,
      workEndTime: company.workEndTime,
      workDays: company.workDays,
      workScheduleByDay: company.workScheduleByDay,
      shiftPresets: company.shiftPresets,
    };
    const shiftPresets = normalizeShiftPresets(company.shiftPresets);
    return NextResponse.json({ employees, shiftPresets, companySchedule });
  } catch (e) {
    console.error("[employees GET]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    // DB 스키마가 최신이 아닐 때 (Department 테이블 미생성) 친절한 에러
    if (
      message.includes("Unknown field") ||
      message.includes("does not exist") ||
      message.includes("relation \"Department\"") ||
      message.includes("column") ||
      message.includes("P2021") ||
      message.includes("P2022")
    ) {
      return NextResponse.json(
        {
          error:
            "DB 스키마가 최신이 아닙니다. 서버를 중지한 뒤 npx prisma migrate deploy && npx prisma generate 실행 후 다시 시도해 주세요.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: `직원 조회 실패: ${message}` }, { status: 500 });
  }
}

const postSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  departmentId: z.string().min(1).max(40).optional().nullable(),
  role: z.enum(COMPANY_ROLES).optional(),
});

/** 직원 추가 (좌석 상한 seatLimit 적용) */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COMPANY_ADMIN" && session.user.role !== "HR_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 400 });
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

  const { email, name, password, departmentId } = parsed.data;
  // 새 직원 역할 — 미지정 시 EMPLOYEE. 호출자보다 *엄격히 낮은* 등급만 허용.
  const requestedRole = (parsed.data.role ?? "EMPLOYEE") as Role;
  if (
    requestedRole !== "EMPLOYEE" &&
    !canAssignRole(session.user.role, "EMPLOYEE", requestedRole)
  ) {
    return NextResponse.json(
      { error: "ROLE_NOT_ALLOWED", message: "허용되지 않는 역할입니다." },
      { status: 403 }
    );
  }
  const role = requestedRole;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const count = await prisma.employee.count({ where: { companyId } });
  if (count >= company.seatLimit) {
    return NextResponse.json(
      { error: `좌석 상한(${company.seatLimit}명)에 도달했습니다. 요금제를 상향하세요.` },
      { status: 403 }
    );
  }

  // 부서 ID가 들어오면 동일 회사 소속인지 확인 (다른 회사 부서 차단)
  if (departmentId) {
    const dep = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { companyId: true },
    });
    if (!dep || dep.companyId !== companyId) {
      return NextResponse.json({ error: "INVALID_DEPARTMENT" }, { status: 400 });
    }
  }

  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup) {
    return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId,
          email,
          passwordHash,
          role,
          consentGivenAt: null,
          consentVersion: null,
        },
      });
      await tx.employee.create({
        data: {
          companyId,
          userId: user.id,
          name: name.trim(),
          departmentId: departmentId ?? null,
        },
      });
    });
  } catch (e) {
    console.error("[employees POST]", e);
    return NextResponse.json({ error: "생성 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
