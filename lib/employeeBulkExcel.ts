import type { Role } from "@prisma/client";
import ExcelJS from "exceljs";

export const EMPLOYEE_BULK_TEMPLATE_FILENAME = "Add employee to HeresNow.xlsx";

const COMPANY_ROLES: Role[] = ["EMPLOYEE", "APPROVER", "HR_MANAGER", "COMPANY_ADMIN"];

export type EmployeeBulkTemplateLabels = {
  sheetEmployees: string;
  sheetDepartments: string;
  colEmail: string;
  colName: string;
  colPassword: string;
  colDepartment: string;
  colRole: string;
  exampleNote: string;
  deptSheetTitle: string;
  deptColName: string;
};

export const EMPLOYEE_BULK_LABELS_KO: EmployeeBulkTemplateLabels = {
  sheetEmployees: "직원 등록",
  sheetDepartments: "부서 목록",
  colEmail: "이메일",
  colName: "이름",
  colPassword: "임시 비밀번호",
  colDepartment: "부서",
  colRole: "역할",
  exampleNote: "예시(삭제 후 입력)",
  deptSheetTitle: "등록 가능한 부서",
  deptColName: "부서명",
};

export const EMPLOYEE_BULK_LABELS_EN: EmployeeBulkTemplateLabels = {
  sheetEmployees: "Employees",
  sheetDepartments: "Departments",
  colEmail: "Email",
  colName: "Name",
  colPassword: "Temporary password",
  colDepartment: "Department",
  colRole: "Role",
  exampleNote: "Example (delete before upload)",
  deptSheetTitle: "Available departments",
  deptColName: "Department name",
};

export type ParsedEmployeeBulkRow = {
  rowNumber: number;
  email: string;
  name: string;
  password: string;
  departmentName: string;
  roleRaw: string;
};

const ROLE_ALIASES: Record<string, Role> = {
  employee: "EMPLOYEE",
  직원: "EMPLOYEE",
  approver: "APPROVER",
  승인자: "APPROVER",
  hr: "HR_MANAGER",
  hr_manager: "HR_MANAGER",
  hrmanager: "HR_MANAGER",
  "hr manager": "HR_MANAGER",
  "hr 관리자": "HR_MANAGER",
  company_admin: "COMPANY_ADMIN",
  companyadmin: "COMPANY_ADMIN",
  "company admin": "COMPANY_ADMIN",
  "회사 관리자": "COMPANY_ADMIN",
  관리자: "COMPANY_ADMIN",
};

export function parseEmployeeRole(raw: string | undefined | null): Role | null {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return "EMPLOYEE";
  if (COMPANY_ROLES.includes(key.toUpperCase() as Role)) {
    return key.toUpperCase() as Role;
  }
  return ROLE_ALIASES[key] ?? null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text?: string }).text ?? "").trim();
  }
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/임시\s*비밀번호|temporary\s*password/gi, "password");
}

type HeaderMap = {
  email?: number;
  name?: number;
  password?: number;
  department?: number;
  role?: number;
};

function mapHeaders(headerRow: ExcelJS.Row): HeaderMap {
  const map: HeaderMap = {};
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const h = normalizeHeader(cellText(cell.value));
    if (!h) return;
    if (h === "email" || h === "이메일" || h.includes("email")) map.email = col;
    else if (h === "name" || h === "이름") map.name = col;
    else if (h === "password" || h.includes("password") || h.includes("비밀번호")) map.password = col;
    else if (h === "department" || h === "부서" || h.includes("department")) map.department = col;
    else if (h === "role" || h === "역할") map.role = col;
  });
  // 기본 열 순서 (헤더 없을 때)
  if (!map.email && !map.name) {
    return { email: 1, name: 2, password: 3, department: 4, role: 5 };
  }
  return map;
}

export async function buildEmployeeBulkTemplate(
  departmentNames: string[],
  labels: EmployeeBulkTemplateLabels
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HeresNow";

  const ws = wb.addWorksheet(labels.sheetEmployees, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: labels.colEmail, key: "email", width: 28 },
    { header: labels.colName, key: "name", width: 18 },
    { header: labels.colPassword, key: "password", width: 18 },
    { header: labels.colDepartment, key: "department", width: 22 },
    { header: labels.colRole, key: "role", width: 16 },
  ];
  ws.addRow({
    email: "employee@example.com",
    name: labels.exampleNote,
    password: "ChangeMe123",
    department: departmentNames[0] ?? "Department",
    role: "EMPLOYEE",
  });
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF7" },
  };

  const deptSheet = wb.addWorksheet(labels.sheetDepartments);
  deptSheet.getCell(1, 1).value = labels.deptSheetTitle;
  deptSheet.getCell(1, 1).font = { bold: true };
  deptSheet.getCell(2, 1).value = labels.deptColName;
  deptSheet.getCell(2, 1).font = { bold: true };
  departmentNames.forEach((name, i) => {
    deptSheet.getCell(3 + i, 1).value = name;
  });
  deptSheet.getColumn(1).width = 32;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function parseEmployeeBulkWorkbook(
  data: ArrayBuffer | Buffer
): Promise<{ rows: ParsedEmployeeBulkRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { rows: [], errors: ["워크시트를 찾을 수 없습니다."] };
  }

  const headerRow = ws.getRow(1);
  const map = mapHeaders(headerRow);
  if (!map.email || !map.name || !map.password || !map.department) {
    return {
      rows: [],
      errors: ["필수 열(이메일, 이름, 임시 비밀번호, 부서)을 찾을 수 없습니다."],
    };
  }

  const rows: ParsedEmployeeBulkRow[] = [];
  const errors: string[] = [];
  const maxRow = Math.min(ws.rowCount, 502);

  for (let r = 2; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const email = cellText(row.getCell(map.email!).value).toLowerCase();
    const name = cellText(row.getCell(map.name!).value);
    const password = cellText(row.getCell(map.password!).value);
    const departmentName = cellText(row.getCell(map.department!).value);
    const roleRaw = map.role ? cellText(row.getCell(map.role).value) : "";

    if (!email && !name && !password && !departmentName) continue;
    if (name === EMPLOYEE_BULK_LABELS_KO.exampleNote || name === EMPLOYEE_BULK_LABELS_EN.exampleNote) {
      continue;
    }

    rows.push({
      rowNumber: r,
      email,
      name,
      password,
      departmentName,
      roleRaw,
    });
  }

  if (rows.length === 0) {
    errors.push("등록할 데이터 행이 없습니다.");
  }
  if (rows.length > 500) {
    errors.push("한 번에 최대 500명까지 등록할 수 있습니다.");
  }

  return { rows: rows.slice(0, 500), errors };
}
