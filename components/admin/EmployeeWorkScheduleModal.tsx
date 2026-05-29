"use client";

import { useI18n } from "@/components/LanguageProvider";
import { LocaleTimeInput } from "@/components/LocaleTimeInput";
import type { WorkScheduleType } from "@/lib/employeeWorkSchedule";
import {
  DEFAULT_SHIFT_PRESETS,
  localizeShiftPresetsMap,
  SHIFT_CODES,
  type ShiftCode,
  type ShiftLocale,
  type ShiftPresetsMap,
} from "@/lib/shiftPresets";
import { btnPrimary, btnSecondary, errorText, label, select } from "@/lib/uiStyles";
import { useEffect, useState } from "react";

export type EmployeeScheduleTarget = {
  id: string;
  name: string;
  workScheduleType?: string | null;
  shiftCode?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  scheduleSummary?: string;
};

type Props = {
  open: boolean;
  employee: EmployeeScheduleTarget | null;
  shiftPresets: ShiftPresetsMap;
  companyDefault: { workStartTime: string; workEndTime: string };
  onClose: () => void;
  onSaved: () => void;
};

export function EmployeeWorkScheduleModal({
  open,
  employee,
  shiftPresets,
  companyDefault,
  onClose,
  onSaved,
}: Props) {
  const { t, locale } = useI18n();
  const loc: ShiftLocale = locale === "en" ? "en" : "ko";
  const presets = localizeShiftPresetsMap(shiftPresets ?? DEFAULT_SHIFT_PRESETS, loc);
  const [mode, setMode] = useState<WorkScheduleType>("COMPANY");
  const [shiftCode, setShiftCode] = useState<ShiftCode>("A");
  const [workStart, setWorkStart] = useState(companyDefault.workStartTime);
  const [workEnd, setWorkEnd] = useState(companyDefault.workEndTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !employee) return;
    const type =
      employee.workScheduleType === "SHIFT" || employee.workScheduleType === "CUSTOM"
        ? employee.workScheduleType
        : "COMPANY";
    setMode(type);
    setShiftCode(
      employee.shiftCode === "B" || employee.shiftCode === "C" ? employee.shiftCode : "A"
    );
    setWorkStart(employee.workStartTime ?? companyDefault.workStartTime);
    setWorkEnd(employee.workEndTime ?? companyDefault.workEndTime);
    setError(null);
  }, [open, employee, companyDefault.workStartTime, companyDefault.workEndTime]);

  if (!open || !employee) return null;

  async function save() {
    setSaving(true);
    setError(null);
    const body =
      mode === "COMPANY"
        ? { workScheduleType: "COMPANY" as const }
        : mode === "SHIFT"
          ? { workScheduleType: "SHIFT" as const, shiftCode }
          : {
              workScheduleType: "CUSTOM" as const,
              workStartTime: workStart,
              workEndTime: workEnd,
            };

    const r = await fetch(`/api/admin/employees/${encodeURIComponent(employee!.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      setError(typeof j.error === "string" ? j.error : t("admin.empScheduleSaveFail"));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emp-schedule-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--background)] p-5 shadow-xl">
        <h2 id="emp-schedule-title" className="text-lg font-semibold text-[var(--foreground)]">
          {t("admin.empScheduleTitle").replace("{name}", employee.name)}
        </h2>
        <p className="mt-1 text-[0.8125rem] text-[var(--apple-label-secondary)]">
          {t("admin.empScheduleLead").replace("{start}", companyDefault.workStartTime).replace("{end}", companyDefault.workEndTime)}
        </p>

        <div className="mt-4 space-y-3">
          <label className={label}>{t("admin.empScheduleModeLabel")}</label>
          <select
            className={select}
            value={mode}
            onChange={(e) => setMode(e.target.value as WorkScheduleType)}
            disabled={saving}
          >
            <option value="COMPANY">{t("admin.empScheduleModeCompany")}</option>
            <option value="SHIFT">{t("admin.empScheduleModeShift")}</option>
            <option value="CUSTOM">{t("admin.empScheduleModeCustom")}</option>
          </select>

          {mode === "SHIFT" && (
            <div className="space-y-2">
              {SHIFT_CODES.map((code) => {
                const p = presets[code];
                return (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--apple-separator)] px-3 py-2"
                  >
                    <input
                      type="radio"
                      name="shift"
                      checked={shiftCode === code}
                      onChange={() => setShiftCode(code)}
                      disabled={saving}
                    />
                    <span className="text-[0.875rem]">
                      {p.label} ({p.workStartTime}–{p.workEndTime})
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {mode === "CUSTOM" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}>{t("admin.settingsWorkStart")}</span>
                <LocaleTimeInput
                  value={workStart}
                  onChange={setWorkStart}
                  disabled={saving}
                  ariaLabel={t("admin.settingsWorkStart")}
                  className="mt-1.5"
                />
              </label>
              <label className="block">
                <span className={label}>{t("admin.settingsWorkEnd")}</span>
                <LocaleTimeInput
                  value={workEnd}
                  onChange={setWorkEnd}
                  disabled={saving}
                  ariaLabel={t("admin.settingsWorkEnd")}
                  className="mt-1.5"
                />
              </label>
            </div>
          )}
        </div>

        {error && <p className={`mt-3 text-[0.875rem] ${errorText}`}>{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={saving}>
            {t("admin.empScheduleCancel")}
          </button>
          <button type="button" className={btnPrimary} onClick={() => void save()} disabled={saving}>
            {saving ? t("common.processing") : t("admin.empScheduleSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
