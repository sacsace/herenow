import { prisma } from "@/lib/prisma";
import { canAssignRole } from "@/lib/roleHierarchy";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";

export type CreateEmployeeInput = {
  companyId: string;
  email: string;
  name: string;
  password: string;
  departmentId: string | null;
  role: Role;
};

export type CreateEmployeeResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export async function createCompanyEmployee(
  input: CreateEmployeeInput,
  opts: { seatLimit: number; currentCount: number; callerRole: Role | string }
): Promise<CreateEmployeeResult> {
  const { companyId, email, name, password, departmentId, role } = input;

  if (opts.currentCount >= opts.seatLimit) {
    return {
      ok: false,
      code: "SEAT_LIMIT",
      message: `좌석 상한(${opts.seatLimit}명)에 도달했습니다.`,
    };
  }

  if (departmentId) {
    const dep = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { companyId: true },
    });
    if (!dep || dep.companyId !== companyId) {
      return { ok: false, code: "INVALID_DEPARTMENT", message: "부서를 찾을 수 없습니다." };
    }
  }

  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup) {
    return { ok: false, code: "EMAIL_TAKEN", message: "이미 등록된 이메일입니다." };
  }

  if (role !== "EMPLOYEE" && !canAssignRole(opts.callerRole, "EMPLOYEE", role)) {
    return { ok: false, code: "ROLE_NOT_ALLOWED", message: "허용되지 않는 역할입니다." };
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
          departmentId,
        },
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, code: "CREATE_FAILED", message: "생성에 실패했습니다." };
  }
}
