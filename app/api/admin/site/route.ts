import { auth } from "@/auth";
import { DEFAULT_SITE_RADIUS_M } from "@/lib/siteGeofence";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const adminRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "APPROVER", "SUPER_ADMIN"]);
const editRoles = new Set(["COMPANY_ADMIN", "HR_MANAGER", "SUPER_ADMIN"]);

const workScheduleModeSchema = z.enum(["COMPANY", "SHIFT", "CUSTOM"]);
const shiftCodeSchema = z.enum(["A", "B", "C"]);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

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

const siteFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  allowedRadius: z.number().finite().min(50).max(2000).optional(),
  departmentIds: z.array(z.string().min(1)).optional(),
  workScheduleMode: workScheduleModeSchema.optional(),
  shiftCode: shiftCodeSchema.nullable().optional(),
  workStartTime: hhmm.nullable().optional(),
  workEndTime: hhmm.nullable().optional(),
});

const siteBodySchema = siteFieldsSchema.superRefine((data, ctx) => {
    const mode = data.workScheduleMode ?? "COMPANY";
    if (mode === "SHIFT" && data.shiftCode == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "교대 근무지는 교대(A/B/C)를 선택해 주세요.",
        path: ["shiftCode"],
      });
    }
    if (mode === "CUSTOM") {
      if (!data.workStartTime || !data.workEndTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "개별 근무시간을 입력해 주세요.",
          path: ["workStartTime"],
        });
      }
    }
  });

const siteSelect = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  allowedRadius: true,
  workScheduleMode: true,
  shiftCode: true,
  workStartTime: true,
  workEndTime: true,
  createdAt: true,
  departments: { select: { departmentId: true } },
} as const;

function serializeSite(site: {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadius: number;
  workScheduleMode: string;
  shiftCode: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  createdAt: Date;
  departments: { departmentId: string }[];
}) {
  return {
    id: site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    allowedRadius: site.allowedRadius,
    workScheduleMode: site.workScheduleMode,
    shiftCode: site.shiftCode,
    workStartTime: site.workStartTime,
    workEndTime: site.workEndTime,
    createdAt: site.createdAt,
    departmentIds: site.departments.map((d) => d.departmentId),
  };
}

async function syncSiteDepartments(
  tx: Prisma.TransactionClient,
  siteId: string,
  companyId: string,
  departmentIds: string[]
) {
  const uniqueIds = [...new Set(departmentIds)];
  await tx.siteDepartment.deleteMany({ where: { siteId } });
  if (uniqueIds.length === 0) return;

  const valid = await tx.department.findMany({
    where: { companyId, id: { in: uniqueIds } },
    select: { id: true },
  });
  if (valid.length > 0) {
    await tx.siteDepartment.createMany({
      data: valid.map((d) => ({ siteId, departmentId: d.id })),
    });
  }
}

function siteScheduleData(parsed: z.infer<typeof siteFieldsSchema>) {
  const mode = parsed.workScheduleMode ?? "COMPANY";
  return {
    workScheduleMode: mode,
    shiftCode: mode === "SHIFT" ? parsed.shiftCode ?? null : null,
    workStartTime: mode === "CUSTOM" ? parsed.workStartTime ?? null : null,
    workEndTime: mode === "CUSTOM" ? parsed.workEndTime ?? null : null,
  };
}

/** 회사 근무지(사무실) 목록 */
export async function GET(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !adminRoles.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const sites = await prisma.site.findMany({
    where: { companyId: resolved.companyId },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    select: siteSelect,
  });

  return NextResponse.json({
    sites: sites.map(serializeSite),
    defaultRadius: DEFAULT_SITE_RADIUS_M,
    canEdit: editRoles.has(role),
  });
}

/** 근무지 추가 */
export async function POST(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !editRoles.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = siteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, latitude, longitude, allowedRadius, departmentIds } = parsed.data;

  const site = await prisma.$transaction(async (tx) => {
    const created = await tx.site.create({
      data: {
        companyId: resolved.companyId,
        name: name.trim(),
        latitude,
        longitude,
        allowedRadius: allowedRadius ?? DEFAULT_SITE_RADIUS_M,
        ...siteScheduleData(parsed.data),
      },
      select: siteSelect,
    });
    await syncSiteDepartments(tx, created.id, resolved.companyId, departmentIds ?? []);
    return tx.site.findUniqueOrThrow({
      where: { id: created.id },
      select: siteSelect,
    });
  });

  return NextResponse.json({ site: serializeSite(site) });
}

const patchSchema = siteFieldsSchema
  .extend({
    id: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    const mode = data.workScheduleMode ?? "COMPANY";
    if (mode === "SHIFT" && data.shiftCode == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "교대 근무지는 교대(A/B/C)를 선택해 주세요.",
        path: ["shiftCode"],
      });
    }
    if (mode === "CUSTOM") {
      if (!data.workStartTime || !data.workEndTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "개별 근무시간을 입력해 주세요.",
          path: ["workStartTime"],
        });
      }
    }
  });

/** 근무지 수정 */
export async function PATCH(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !editRoles.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

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

  const { id, name, latitude, longitude, allowedRadius, departmentIds } = parsed.data;

  const existing = await prisma.site.findFirst({
    where: { id, companyId: resolved.companyId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "근무지를 찾을 수 없습니다." }, { status: 404 });
  }

  const site = await prisma.$transaction(async (tx) => {
    await tx.site.update({
      where: { id },
      data: {
        name: name.trim(),
        latitude,
        longitude,
        allowedRadius: allowedRadius ?? DEFAULT_SITE_RADIUS_M,
        ...siteScheduleData(parsed.data),
      },
    });
    if (departmentIds !== undefined) {
      await syncSiteDepartments(tx, id, resolved.companyId, departmentIds);
    }
    return tx.site.findUniqueOrThrow({ where: { id }, select: siteSelect });
  });

  return NextResponse.json({ site: serializeSite(site) });
}

/** 근무지 삭제 */
export async function DELETE(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !role || !editRoles.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = resolveCompanyId(role, session.user.companyId, new URL(req.url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.site.findFirst({
    where: { id, companyId: resolved.companyId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "근무지를 찾을 수 없습니다." }, { status: 404 });
  }

  const linked = await prisma.attendanceRecord.count({
    where: { siteId: id, companyId: resolved.companyId },
  });
  if (linked > 0) {
    return NextResponse.json(
      {
        error: "이 근무지에 연결된 출퇴근 기록이 있어 삭제할 수 없습니다.",
      },
      { status: 409 }
    );
  }

  await prisma.site.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
