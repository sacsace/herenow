import type { CompanyScheduleFields } from "@/lib/employeeWorkSchedule";
import { isShiftCode } from "@/lib/employeeWorkSchedule";
import { normalizeShiftPresets, shiftPresetToSchedule } from "@/lib/shiftPresets";

export type SiteScheduleFields = {
  workScheduleMode?: string | null;
  shiftCode?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
};

export function siteOverridesCompanySchedule(site: SiteScheduleFields | null | undefined): boolean {
  if (!site) return false;
  const mode = site.workScheduleMode ?? "COMPANY";
  if (mode === "SHIFT" && isShiftCode(site.shiftCode)) return true;
  return mode === "CUSTOM";
}

/** 지점 설정을 회사 스케줄 필드 형태로 변환 */
export function resolveSiteAsCompanySchedule(
  site: SiteScheduleFields,
  company: CompanyScheduleFields
): Pick<CompanyScheduleFields, "workStartTime" | "workEndTime" | "workScheduleByDay"> {
  const mode = site.workScheduleMode ?? "COMPANY";
  if (mode === "SHIFT" && isShiftCode(site.shiftCode)) {
    const presets = normalizeShiftPresets(company.shiftPresets);
    const times = shiftPresetToSchedule(presets[site.shiftCode]);
    return {
      workStartTime: times.workStartTime,
      workEndTime: times.workEndTime,
      workScheduleByDay: undefined,
    };
  }
  if (mode === "CUSTOM") {
    return {
      workStartTime: site.workStartTime ?? company.workStartTime,
      workEndTime: site.workEndTime ?? company.workEndTime,
      workScheduleByDay: undefined,
    };
  }
  return {
    workStartTime: company.workStartTime,
    workEndTime: company.workEndTime,
    workScheduleByDay: company.workScheduleByDay,
  };
}
