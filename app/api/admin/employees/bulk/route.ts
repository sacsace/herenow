import { auth } from "@/auth";
import { createCompanyEmployee } from "@/lib/employeeCreate";
import { parseEmployeeBulkWorkbook, parseEmployeeRole } from "@/lib/employeeBulkExcel";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";

export type BulkImportFailure = {
  row: number;
  email?: string;
  error: string;
};

/** Excel 파일로 직원 일괄 등록 */
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json({ error: "Excel(.xlsx) 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const { rows, errors: parseErrors } = await parseEmployeeBulkWorkbook(arrayBuffer);
  if (parseErrors.length > 0) {
    return NextResponse.json({ error: parseErrors[0], errors: parseErrors }, { status: 400 });
  }

  const [company, departments, employeeCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { seatLimit: true },
    }),
    prisma.department.findMany({
      where: { companyId },
      select: { id: true, name: true },
    }),
    prisma.employee.count({ where: { companyId } }),
  ]);

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const deptByName = new Map(
    departments.map((d) => [d.name.trim().toLowerCase(), d.id] as const)
  );

  const failures: BulkImportFailure[] = [];
  let created = 0;
  let currentCount = employeeCount;
  const seenEmails = new Set<string>();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const empName = row.name.trim();
    const password = row.password;
    const deptName = row.departmentName.trim();

    if (!email || !empName || !password || !deptName) {
      failures.push({
        row: row.rowNumber,
        email: email || undefined,
        error: "이메일, 이름, 임시 비밀번호, 부서는 필수입니다.",
      });
      continue;
    }
    if (!emailRe.test(email)) {
      failures.push({ row: row.rowNumber, email, error: "이메일 형식이 올바르지 않습니다." });
      continue;
    }
    if (password.length < 8) {
      failures.push({ row: row.rowNumber, email, error: "비밀번호는 8자 이상이어야 합니다." });
      continue;
    }
    if (seenEmails.has(email)) {
      failures.push({ row: row.rowNumber, email, error: "파일 내 이메일이 중복됩니다." });
      continue;
    }
    seenEmails.add(email);

    const departmentId = deptByName.get(deptName.toLowerCase());
    if (!departmentId) {
      failures.push({
        row: row.rowNumber,
        email,
        error: `부서를 찾을 수 없습니다: ${deptName}`,
      });
      continue;
    }

    const role = parseEmployeeRole(row.roleRaw);
    if (!role) {
      failures.push({
        row: row.rowNumber,
        email,
        error: `역할을 인식할 수 없습니다: ${row.roleRaw || "(비어 있음)"}`,
      });
      continue;
    }

    const result = await createCompanyEmployee(
      {
        companyId,
        email,
        name: empName,
        password,
        departmentId,
        role: role as Role,
      },
      {
        seatLimit: company.seatLimit,
        currentCount,
        callerRole: session.user.role!,
      }
    );

    if (!result.ok) {
      failures.push({
        row: row.rowNumber,
        email,
        error: result.message,
      });
      continue;
    }

    created += 1;
    currentCount += 1;
  }

  return NextResponse.json({
    created,
    failed: failures.length,
    failures,
    totalRows: rows.length,
  });
}
