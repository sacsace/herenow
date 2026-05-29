"use client";

import { useI18n } from "@/components/LanguageProvider";
import { LocaleTimeInput } from "@/components/LocaleTimeInput";
import { normalizeWorkScheduleByDay, weekdayShortLabel } from "@/lib/companyWorkSchedule";
import {
  DEFAULT_SHIFT_PRESETS,
  localizeShiftPresetsMap,
  SHIFT_CODES,
  type ShiftLocale,
  type ShiftPresetsMap,
} from "@/lib/shiftPresets";
import {
  DEFAULT_COMPANY_TIMEZONE,
  formatTimezoneOptionLabel,
  timezoneOptionsForSelect,
} from "@/lib/companyTimezones";
import {
  btnPrimary,
  chipBtn,
  errorText,
  groupedCard,
  hint,
  label,
  sectionLabel,
  select,
  successText,
} from "@/lib/uiStyles";
import { useCallback, useEffect, useState } from "react";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

type DayTimeState = { workStartTime: string; workEndTime: string };
type WorkScheduleByDayState = Partial<Record<number, DayTimeState>>;

function buildDayScheduleState(
  fallbackStart: string,
  fallbackEnd: string,
  raw?: unknown
): WorkScheduleByDayState {
  const normalized = normalizeWorkScheduleByDay(raw);
  const out: WorkScheduleByDayState = {};
  for (const day of WEEKDAYS) {
    const v = normalized[day];
    out[day] = {
      workStartTime: v?.workStartTime ?? fallbackStart,
      workEndTime: v?.workEndTime ?? fallbackEnd,
    };
  }
  return out;
}

type Settings = {
  timezone: string;
  faceRecognitionEnabled: boolean;
  geofenceMode: string;
  workStartTime: string | null;
  workEndTime: string | null;
  workDaysArray: number[];
  workScheduleByDay?: unknown;
  shiftPresets?: ShiftPresetsMap;
  canEdit: boolean;
};

type Props = {
  /** SUPER_ADMIN이 다른 회사 설정을 볼·편집할 때만 지정. 미지정 시 세션 회사. */
  companyId?: string;
};

export function AdminCompanySettings({ companyId }: Props = {}) {
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [timezone, setTimezone] = useState<string>(DEFAULT_COMPANY_TIMEZONE);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [workDaySet, setWorkDaySet] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [workScheduleByDay, setWorkScheduleByDay] = useState<WorkScheduleByDayState>(
    buildDayScheduleState("09:00", "18:00")
  );
  const [shiftPresets, setShiftPresets] = useState<ShiftPresetsMap>(DEFAULT_SHIFT_PRESETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await fetch(`/api/admin/settings${qs}`);
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) {
      setSettings(null);
      setError(typeof j.error === "string" ? j.error : t("admin.settingsLoadFail"));
      return;
    }
    const s = j as Settings & {
      workStartTime?: string | null;
      workEndTime?: string | null;
      faceRecognitionEnabled?: boolean;
      workScheduleByDay?: unknown;
      shiftPresets?: ShiftPresetsMap;
    };
    const tz =
      typeof s.timezone === "string" && s.timezone.trim() ? s.timezone.trim() : DEFAULT_COMPANY_TIMEZONE;
    setSettings({
      timezone: tz,
      faceRecognitionEnabled: Boolean(s.faceRecognitionEnabled),
      geofenceMode: typeof s.geofenceMode === "string" ? s.geofenceMode : "OFF",
      workStartTime: s.workStartTime ?? "09:00",
      workEndTime: s.workEndTime ?? "18:00",
      workDaysArray: s.workDaysArray ?? [1, 2, 3, 4, 5],
      canEdit: Boolean(s.canEdit),
    });
    setTimezone(tz);
    setWorkStart(s.workStartTime ?? "09:00");
    setWorkEnd(s.workEndTime ?? "18:00");
    setWorkDaySet(new Set(s.workDaysArray ?? [1, 2, 3, 4, 5]));
    setWorkScheduleByDay(
      buildDayScheduleState(s.workStartTime ?? "09:00", s.workEndTime ?? "18:00", s.workScheduleByDay)
    );
    const loc: ShiftLocale = locale === "en" ? "en" : "ko";
    setShiftPresets(
      localizeShiftPresetsMap(s.shiftPresets ?? DEFAULT_SHIFT_PRESETS, loc)
    );
  }, [t, qs, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const loc: ShiftLocale = locale === "en" ? "en" : "ko";
    setShiftPresets((prev) => localizeShiftPresetsMap(prev, loc));
  }, [locale]);

  async function patch(body: Record<string, unknown>) {
    if (!settings?.canEdit || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const r = await fetch(`/api/admin/settings${qs}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      const err = j.error as { fieldErrors?: Record<string, string[]> } | string | undefined;
      if (typeof err === "string") setError(err);
      else if (err?.fieldErrors?.workEndTime?.[0]) setError(err.fieldErrors.workEndTime[0]);
      else setError(t("admin.settingsSaveFail"));
      return;
    }
    await load();
    setSaved(true);
  }

  function toggleDay(day: number) {
    setWorkDaySet((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        if (next.size <= 1) return prev;
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  async function saveWorkSchedule() {
    const byDay: Record<string, DayTimeState> = {};
    for (const day of [...workDaySet].sort((a, b) => a - b)) {
      const window = workScheduleByDay[day] ?? {
        workStartTime: workStart,
        workEndTime: workEnd,
      };
      byDay[String(day)] = {
        workStartTime: window.workStartTime,
        workEndTime: window.workEndTime,
      };
    }
    await patch({
      timezone,
      workStartTime: workStart,
      workEndTime: workEnd,
      workDays: [...workDaySet].sort((a, b) => a - b).join(","),
      workScheduleByDay: byDay,
      shiftPresets,
    });
  }

  function setShiftPresetField(
    code: (typeof SHIFT_CODES)[number],
    key: "label" | "workStartTime" | "workEndTime",
    value: string
  ) {
    setShiftPresets((prev) => ({
      ...prev,
      [code]: { ...prev[code], [key]: value },
    }));
  }

  function setDayTime(day: number, key: "workStartTime" | "workEndTime", value: string) {
    setWorkScheduleByDay((prev) => {
      const base = prev[day] ?? { workStartTime: workStart, workEndTime: workEnd };
      return { ...prev, [day]: { ...base, [key]: value } };
    });
  }

  const timezoneOptions = timezoneOptionsForSelect(settings?.timezone ?? timezone);

  return (
    <section>
      <p className={sectionLabel}>{t("admin.settingsTitle")}</p>
      <div className={groupedCard}>
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-[0.9375rem] leading-relaxed text-[var(--apple-label-secondary)]">
            {t("admin.settingsLead")}
          </p>

          {loading && (
            <p className="mt-4 text-[0.9375rem] text-[var(--apple-label-secondary)]">{t("common.loading")}</p>
          )}
          {error && <p className={`mt-4 ${errorText}`}>{error}</p>}
          {saved && !error && <p className={`mt-4 ${successText}`}>{t("admin.settingsSaved")}</p>}

          {!loading && settings && (
            <div className="mt-5 space-y-8">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--fill-tertiary)] p-4 sm:items-center">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-0 bg-[var(--fill-secondary)] text-[var(--apple-blue)] accent-[var(--apple-blue)] focus:ring-2 focus:ring-[var(--apple-blue)]/25 disabled:opacity-50 sm:mt-0"
                  checked={settings.faceRecognitionEnabled}
                  disabled={!settings.canEdit || saving}
                  onChange={(e) => void patch({ faceRecognitionEnabled: e.target.checked })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-[var(--foreground)]">
                    {t("admin.settingsFaceRecognition")}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-[var(--apple-label-secondary)]">
                    {settings.faceRecognitionEnabled
                      ? t("admin.settingsFaceOnHint")
                      : t("admin.settingsFaceOffHint")}
                  </span>
                </span>
              </label>

              <div className="rounded-xl bg-[var(--fill-tertiary)] p-4 sm:p-5">
                <label className="block">
                  <span className={label}>{t("admin.settingsGeofenceMode")}</span>
                  <select
                    className={`${select} mt-1.5 bg-[var(--fill-secondary)]`}
                    value={settings.geofenceMode}
                    disabled={!settings.canEdit || saving}
                    onChange={(e) => void patch({ geofenceMode: e.target.value })}
                  >
                    <option value="OFF">{t("admin.settingsGeofenceOff")}</option>
                    <option value="WARN">{t("admin.settingsGeofenceWarn")}</option>
                    <option value="BLOCK">{t("admin.settingsGeofenceBlock")}</option>
                  </select>
                  <p className={`mt-1.5 ${hint}`}>{t("admin.settingsGeofenceHint")}</p>
                </label>
              </div>

              <div className="rounded-xl bg-[var(--fill-tertiary)] p-4 sm:p-5">
                <h3 className="text-[0.9375rem] font-semibold text-[var(--foreground)]">
                  {t("admin.settingsWorkTitle")}
                </h3>
                <p className="mt-1 text-[0.8125rem] text-[var(--apple-label-secondary)]">
                  {t("admin.settingsWorkLead")}
                </p>

                <label className="mt-4 block">
                  <span className={label}>{t("admin.settingsTimezone")}</span>
                  <select
                    className={`${select} mt-1.5 bg-[var(--fill-secondary)]`}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={!settings.canEdit || saving}
                    aria-label={t("admin.settingsTimezone")}
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {formatTimezoneOptionLabel(tz, dateLocale)}
                      </option>
                    ))}
                  </select>
                  <p className={`mt-1.5 ${hint}`}>{t("admin.settingsTimezoneHint")}</p>
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={label}>{t("admin.settingsWorkStart")}</span>
                    <LocaleTimeInput
                      value={workStart}
                      onChange={setWorkStart}
                      disabled={!settings.canEdit || saving}
                      ariaLabel={t("admin.settingsWorkStart")}
                      className="mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className={label}>{t("admin.settingsWorkEnd")}</span>
                    <LocaleTimeInput
                      value={workEnd}
                      onChange={setWorkEnd}
                      disabled={!settings.canEdit || saving}
                      ariaLabel={t("admin.settingsWorkEnd")}
                      className="mt-1.5"
                    />
                  </label>
                </div>

                <p className="mt-4 text-[0.9375rem] font-semibold text-[var(--foreground)]">
                  {t("admin.settingsWorkDays")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!settings.canEdit || saving}
                      onClick={() => toggleDay(d)}
                      className={chipBtn(workDaySet.has(d))}
                    >
                      {weekdayShortLabel(d, locale)}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-2">
                  {WEEKDAYS.map((day) => {
                    const dayWindow = workScheduleByDay[day] ?? {
                      workStartTime: workStart,
                      workEndTime: workEnd,
                    };
                    const active = workDaySet.has(day);
                    return (
                      <div
                        key={`time-${day}`}
                        className="grid items-center gap-2 rounded-lg bg-[var(--fill-secondary)] px-3 py-2 sm:grid-cols-[3rem_1fr_1fr]"
                      >
                        <span className="text-[0.8125rem] font-semibold text-[var(--foreground)]">
                          {weekdayShortLabel(day, locale)}
                        </span>
                        <LocaleTimeInput
                          value={dayWindow.workStartTime}
                          onChange={(v) => setDayTime(day, "workStartTime", v)}
                          disabled={!settings.canEdit || saving || !active}
                          ariaLabel={`${weekdayShortLabel(day, locale)} ${t("admin.settingsWorkStart")}`}
                        />
                        <LocaleTimeInput
                          value={dayWindow.workEndTime}
                          onChange={(v) => setDayTime(day, "workEndTime", v)}
                          disabled={!settings.canEdit || saving || !active}
                          ariaLabel={`${weekdayShortLabel(day, locale)} ${t("admin.settingsWorkEnd")}`}
                        />
                      </div>
                    );
                  })}
                </div>

                <p className="mt-5 text-[0.9375rem] font-semibold text-[var(--foreground)]">
                  {t("admin.settingsShiftPresetsTitle")}
                </p>
                <p className="mt-1 text-[0.8125rem] text-[var(--apple-label-secondary)]">
                  {t("admin.settingsShiftPresetsLead")}
                </p>
                <div className="mt-3 space-y-3">
                  {SHIFT_CODES.map((code) => (
                    <div
                      key={code}
                      className="grid gap-2 rounded-lg bg-[var(--fill-secondary)] px-3 py-3 sm:grid-cols-[4rem_1fr_1fr_1fr]"
                    >
                      <span className="text-[0.8125rem] font-semibold text-[var(--foreground)]">
                        {code}
                      </span>
                      <input
                        className="h-8 rounded-[0.5rem] bg-[var(--background)] px-2 text-[0.8125rem]"
                        value={shiftPresets[code].label}
                        onChange={(e) => setShiftPresetField(code, "label", e.target.value)}
                        disabled={!settings.canEdit || saving}
                        aria-label={t("admin.settingsShiftLabel")}
                      />
                      <LocaleTimeInput
                        value={shiftPresets[code].workStartTime}
                        onChange={(v) => setShiftPresetField(code, "workStartTime", v)}
                        disabled={!settings.canEdit || saving}
                        ariaLabel={`${code} ${t("admin.settingsWorkStart")}`}
                      />
                      <LocaleTimeInput
                        value={shiftPresets[code].workEndTime}
                        onChange={(v) => setShiftPresetField(code, "workEndTime", v)}
                        disabled={!settings.canEdit || saving}
                        ariaLabel={`${code} ${t("admin.settingsWorkEnd")}`}
                      />
                    </div>
                  ))}
                </div>

                <ul className="mt-3 list-inside list-disc text-[0.8125rem] text-[var(--apple-label-secondary)]">
                  <li>{t("admin.settingsWorkRuleLate")}</li>
                  <li>{t("admin.settingsWorkRuleEarly")}</li>
                  <li>{t("admin.settingsWorkRuleOvertime")}</li>
                  <li>{t("admin.settingsWorkRuleHoliday")}</li>
                </ul>

                {settings.canEdit && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveWorkSchedule()}
                    className={`mt-4 ${btnPrimary}`}
                  >
                    {saving ? t("common.processing") : t("admin.settingsSaveWork")}
                  </button>
                )}
              </div>
            </div>
          )}

          {settings && !settings.canEdit && !loading && !error && (
            <p className="mt-3 text-[0.75rem] text-[var(--apple-label-tertiary)]">{t("admin.settingsReadOnly")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
