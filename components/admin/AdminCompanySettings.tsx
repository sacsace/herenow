"use client";

import { useI18n } from "@/components/LanguageProvider";
import { LocaleTimeInput } from "@/components/LocaleTimeInput";
import { weekdayShortLabel } from "@/lib/companyWorkSchedule";
import {
  btnPrimary,
  chipBtn,
  errorText,
  groupedCard,
  label,
  sectionLabel,
  successText,
} from "@/lib/uiStyles";
import { useCallback, useEffect, useState } from "react";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

type Settings = {
  faceRecognitionEnabled: boolean;
  workStartTime: string | null;
  workEndTime: string | null;
  workDaysArray: number[];
  canEdit: boolean;
};

type Props = {
  /** SUPER_ADMIN이 다른 회사 설정을 볼·편집할 때만 지정. 미지정 시 세션 회사. */
  companyId?: string;
};

export function AdminCompanySettings({ companyId }: Props = {}) {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [workDaySet, setWorkDaySet] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
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
    };
    setSettings({
      faceRecognitionEnabled: Boolean(s.faceRecognitionEnabled),
      workStartTime: s.workStartTime ?? "09:00",
      workEndTime: s.workEndTime ?? "18:00",
      workDaysArray: s.workDaysArray ?? [1, 2, 3, 4, 5],
      canEdit: Boolean(s.canEdit),
    });
    setWorkStart(s.workStartTime ?? "09:00");
    setWorkEnd(s.workEndTime ?? "18:00");
    setWorkDaySet(new Set(s.workDaysArray ?? [1, 2, 3, 4, 5]));
  }, [t, qs]);

  useEffect(() => {
    void load();
  }, [load]);

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
    await patch({
      workStartTime: workStart,
      workEndTime: workEnd,
      workDays: [...workDaySet].sort((a, b) => a - b).join(","),
    });
  }

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
                <h3 className="text-[0.9375rem] font-semibold text-[var(--foreground)]">
                  {t("admin.settingsWorkTitle")}
                </h3>
                <p className="mt-1 text-[0.8125rem] text-[var(--apple-label-secondary)]">
                  {t("admin.settingsWorkLead")}
                </p>

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
