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
import { btnPrimary, btnSecondary, errorText, groupedCard, label, select } from "@/lib/uiStyles";
import { useState } from "react";

type Props = {
  selectedCount: number;
  shiftPresets: ShiftPresetsMap;
  companyDefault: { workStartTime: string; workEndTime: string };
  onApply: (payload: {
    workScheduleType: WorkScheduleType;
    shiftCode?: ShiftCode;
    workStartTime?: string;
    workEndTime?: string;
  }) => Promise<boolean>;
  onClearSelection: () => void;
};

export function EmployeeWorkScheduleBulkBar({
  selectedCount,
  shiftPresets,
  companyDefault,
  onApply,
  onClearSelection,
}: Props) {
  const { t, locale } = useI18n();
  const loc: ShiftLocale = locale === "en" ? "en" : "ko";
  const presets = localizeShiftPresetsMap(shiftPresets ?? DEFAULT_SHIFT_PRESETS, loc);
  const [mode, setMode] = useState<WorkScheduleType>("SHIFT");
  const [shiftCode, setShiftCode] = useState<ShiftCode>("A");
  const [workStart, setWorkStart] = useState(companyDefault.workStartTime);
  const [workEnd, setWorkEnd] = useState(companyDefault.workEndTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selectedCount === 0) return null;

  async function apply() {
    setBusy(true);
    setError(null);
    const ok = await onApply(
      mode === "COMPANY"
        ? { workScheduleType: "COMPANY" }
        : mode === "SHIFT"
          ? { workScheduleType: "SHIFT", shiftCode }
          : {
              workScheduleType: "CUSTOM",
              workStartTime: workStart,
              workEndTime: workEnd,
            }
    );
    setBusy(false);
    if (!ok) setError(t("admin.empScheduleBulkFail"));
  }

  return (
    <div className={`${groupedCard} mb-4`}>
      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.9375rem] font-medium text-[var(--foreground)]">
          {t("admin.empScheduleBulkTitle").replace("{count}", String(selectedCount))}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <label className={label}>{t("admin.empScheduleModeLabel")}</label>
            <select
              className={`${select} mt-1`}
              value={mode}
              onChange={(e) => setMode(e.target.value as WorkScheduleType)}
              disabled={busy}
            >
              <option value="COMPANY">{t("admin.empScheduleModeCompany")}</option>
              <option value="SHIFT">{t("admin.empScheduleModeShift")}</option>
              <option value="CUSTOM">{t("admin.empScheduleModeCustom")}</option>
            </select>
          </div>
          {mode === "SHIFT" && (
            <div className="min-w-[10rem]">
              <label className={label}>{t("admin.empScheduleShiftLabel")}</label>
              <select
                className={`${select} mt-1`}
                value={shiftCode}
                onChange={(e) => setShiftCode(e.target.value as ShiftCode)}
                disabled={busy}
              >
                {SHIFT_CODES.map((code) => (
                  <option key={code} value={code}>
                    {presets[code].label} ({presets[code].workStartTime}–{presets[code].workEndTime})
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode === "CUSTOM" && (
            <>
              <div>
                <label className={label}>{t("admin.settingsWorkStart")}</label>
                <LocaleTimeInput
                  value={workStart}
                  onChange={setWorkStart}
                  disabled={busy}
                  ariaLabel={t("admin.settingsWorkStart")}
                  className="mt-1"
                />
              </div>
              <div>
                <label className={label}>{t("admin.settingsWorkEnd")}</label>
                <LocaleTimeInput
                  value={workEnd}
                  onChange={setWorkEnd}
                  disabled={busy}
                  ariaLabel={t("admin.settingsWorkEnd")}
                  className="mt-1"
                />
              </div>
            </>
          )}
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void apply()}>
            {busy ? t("common.processing") : t("admin.empScheduleBulkApply")}
          </button>
          <button type="button" className={btnSecondary} disabled={busy} onClick={onClearSelection}>
            {t("admin.empScheduleBulkClear")}
          </button>
        </div>
        {error && <p className={`mt-2 text-[0.875rem] ${errorText}`}>{error}</p>}
      </div>
    </div>
  );
}
