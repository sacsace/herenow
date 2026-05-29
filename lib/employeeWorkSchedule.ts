import type { CompanyWorkSchedule } from "@/lib/companyWorkSchedule";
import { normalizeWorkScheduleByDay } from "@/lib/companyWorkSchedule";
import {
  localizedShiftPresetLabel,
  normalizeShiftPresets,
  shiftPresetToSchedule,
  type ShiftCode,
  type ShiftLocale,
} from "@/lib/shiftPresets";
import {
  resolveSiteAsCompanySchedule,
  siteOverridesCompanySchedule,
  type SiteScheduleFields,
} from "@/lib/siteWorkSchedule";

export type WorkScheduleType = "COMPANY" | "SHIFT" | "CUSTOM";

export type EmployeeScheduleFields = {
  workScheduleType?: string | null;
  shiftCode?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  workScheduleByDay?: unknown;
};

export type CompanyScheduleFields = {
  workStartTime: string | null;
  workEndTime: string | null;
  workDays: string | null;
  workScheduleByDay?: unknown;
  shiftPresets?: unknown;
};

export function parseWorkScheduleType(raw: string | null | undefined): WorkScheduleType {
  if (raw === "SHIFT" || raw === "CUSTOM") return raw;
  return "COMPANY";
}

export function isShiftCode(code: string | null | undefined): code is ShiftCode {
  return code === "A" || code === "B" || code === "C";
}

/** 직원·회사 설정을 합쳐 출퇴근 판정에 쓸 스케줄 반환. 지점 오버라이드는 직원이 COMPANY 모드일 때만 적용 */
export function resolveEmployeeWorkSchedule(
  employee: EmployeeScheduleFields,
  company: CompanyScheduleFields,
  site?: SiteScheduleFields | null
): CompanyWorkSchedule {
  const type = parseWorkScheduleType(employee.workScheduleType);
  const companyBase =
    type === "COMPANY" && siteOverridesCompanySchedule(site)
      ? { ...company, ...resolveSiteAsCompanySchedule(site!, company) }
      : company;
  const workDays = companyBase.workDays;

  if (type === "SHIFT" && isShiftCode(employee.shiftCode)) {
    const presets = normalizeShiftPresets(companyBase.shiftPresets);
    const preset = presets[employee.shiftCode];
    const times = shiftPresetToSchedule(preset);
    return {
      workStartTime: times.workStartTime,
      workEndTime: times.workEndTime,
      workDays,
      workScheduleByDay: undefined,
    };
  }

  if (type === "CUSTOM") {
    const byDay = normalizeWorkScheduleByDay(employee.workScheduleByDay);
    const hasByDay = Object.keys(byDay).length > 0;
    return {
      workStartTime: employee.workStartTime ?? companyBase.workStartTime,
      workEndTime: employee.workEndTime ?? companyBase.workEndTime,
      workDays,
      workScheduleByDay: hasByDay ? byDay : employee.workScheduleByDay,
    };
  }

  return {
    workStartTime: companyBase.workStartTime,
    workEndTime: companyBase.workEndTime,
    workDays,
    workScheduleByDay: companyBase.workScheduleByDay,
  };
}

export type EmployeeScheduleSummary = {
  workScheduleType: WorkScheduleType;
  shiftCode: ShiftCode | null;
  label: string;
};

/** UI 표시용 짧은 라벨 */
export function employeeScheduleSummary(
  employee: EmployeeScheduleFields,
  company: CompanyScheduleFields,
  locale: ShiftLocale = "ko"
): EmployeeScheduleSummary {
  const type = parseWorkScheduleType(employee.workScheduleType);
  if (type === "COMPANY") {
    return {
      workScheduleType: "COMPANY",
      shiftCode: null,
      label: locale === "en" ? "Company default" : "회사 기본",
    };
  }
  if (type === "SHIFT" && isShiftCode(employee.shiftCode)) {
    const presets = normalizeShiftPresets(company.shiftPresets);
    const p = presets[employee.shiftCode];
    const shiftName = localizedShiftPresetLabel(employee.shiftCode, locale, p.label);
    return {
      workScheduleType: "SHIFT",
      shiftCode: employee.shiftCode,
      label: `${shiftName} (${p.workStartTime}–${p.workEndTime})`,
    };
  }
  const resolved = resolveEmployeeWorkSchedule(employee, company);
  const start = resolved.workStartTime ?? "09:00";
  const end = resolved.workEndTime ?? "18:00";
  return {
    workScheduleType: "CUSTOM",
    shiftCode: null,
    label: locale === "en" ? `Custom ${start}–${end}` : `개별 ${start}–${end}`,
  };
}
