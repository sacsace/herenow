import { auth } from "@/auth";
import { contentDispositionAttachment } from "@/lib/attendanceExportFilename";
import {
  buildEmployeeBulkTemplate,
  EMPLOYEE_BULK_LABELS_EN,
  EMPLOYEE_BULK_LABELS_KO,
  EMPLOYEE_BULK_TEMPLATE_FILENAME,
} from "@/lib/employeeBulkExcel";
import { STORAGE_KEY } from "@/lib/i18n/dictionaries";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** 직원 일괄 등록 Excel 양식 다운로드 */
export async function GET(req: Request) {
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

  const cookieStore = await cookies();
  const lang = cookieStore.get(STORAGE_KEY)?.value;
  const urlLang = new URL(req.url).searchParams.get("lang");
  const locale = urlLang === "en" || lang === "en" ? "en" : "ko";
  const labels = locale === "en" ? EMPLOYEE_BULK_LABELS_EN : EMPLOYEE_BULK_LABELS_KO;

  const departments = await prisma.department.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const buf = await buildEmployeeBulkTemplate(
    departments.map((d) => d.name),
    labels
  );

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDispositionAttachment(EMPLOYEE_BULK_TEMPLATE_FILENAME),
    },
  });
}
