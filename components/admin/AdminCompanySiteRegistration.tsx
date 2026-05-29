"use client";

import { GooglePlaceAutocompleteInput } from "@/components/admin/GooglePlaceAutocompleteInput";
import { StaticMap } from "@/components/admin/StaticMap";
import { LocaleTimeInput } from "@/components/LocaleTimeInput";
import { useI18n } from "@/components/LanguageProvider";
import { DEFAULT_SITE_RADIUS_M } from "@/lib/siteGeofence";
import { SHIFT_CODES } from "@/lib/shiftPresets";
import {
  btnPrimary,
  btnSecondary,
  errorText,
  groupedCard,
  hint,
  input,
  label,
  sectionLabel,
  select,
  successText,
} from "@/lib/uiStyles";
import { useCallback, useEffect, useState } from "react";

type Department = { id: string; name: string };

type SiteRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadius: number;
  workScheduleMode: string;
  shiftCode: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  departmentIds: string[];
};

type FormMode = { kind: "closed" } | { kind: "add" } | { kind: "edit"; id: string };

type WorkScheduleMode = "COMPANY" | "SHIFT" | "CUSTOM";

function parseLatitude(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isFinite(n) || n < -90 || n > 90) return null;
  return n;
}

function parseLongitude(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isFinite(n) || n < -180 || n > 180) return null;
  return n;
}

function scheduleSummary(site: SiteRow, t: (k: string) => string): string {
  if (site.workScheduleMode === "SHIFT" && site.shiftCode) {
    return t("admin.siteScheduleShift").replace("{code}", site.shiftCode);
  }
  if (site.workScheduleMode === "CUSTOM" && site.workStartTime && site.workEndTime) {
    return t("admin.siteScheduleCustom")
      .replace("{start}", site.workStartTime)
      .replace("{end}", site.workEndTime);
  }
  return t("admin.siteScheduleCompany");
}

export function AdminCompanySiteRegistration() {
  const { t } = useI18n();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [name, setName] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [allowedRadius, setAllowedRadius] = useState(String(DEFAULT_SITE_RADIUS_M));
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(new Set());
  const [workScheduleMode, setWorkScheduleMode] = useState<WorkScheduleMode>("COMPANY");
  const [shiftCode, setShiftCode] = useState<(typeof SHIFT_CODES)[number]>("A");
  const [workStartTime, setWorkStartTime] = useState("09:00");
  const [workEndTime, setWorkEndTime] = useState("18:00");
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [siteRes, deptRes] = await Promise.all([
      fetch("/api/admin/site"),
      fetch("/api/admin/departments"),
    ]);
    const j = await siteRes.json().catch(() => ({}));
    const dj = await deptRes.json().catch(() => ({}));
    setLoading(false);
    if (!siteRes.ok) {
      setSites([]);
      setError(typeof j.error === "string" ? j.error : t("admin.siteLoadFail"));
      return;
    }
    const rows = (j as { sites?: SiteRow[] }).sites ?? [];
    setSites(rows);
    setCanEdit(Boolean((j as { canEdit?: boolean }).canEdit));
    setDepartments((dj as { departments?: Department[] }).departments ?? []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function setCoordFields(lat: number | null, lng: number | null) {
    if (lat != null && lng != null) {
      setCoords({ lat, lng });
      setLatInput(String(lat));
      setLngInput(String(lng));
    } else {
      setCoords(null);
      setLatInput(lat != null ? String(lat) : "");
      setLngInput(lng != null ? String(lng) : "");
    }
  }

  function applyCoordInputs(latStr: string, lngStr: string) {
    setLatInput(latStr);
    setLngInput(lngStr);
    const lat = parseLatitude(latStr);
    const lng = parseLongitude(lngStr);
    if (lat != null && lng != null) {
      setCoords({ lat, lng });
    } else {
      setCoords(null);
    }
  }

  function resetFormFields() {
    setName(t("admin.siteDefaultName"));
    setCoordFields(null, null);
    setAllowedRadius(String(DEFAULT_SITE_RADIUS_M));
    setDepartmentIds(new Set());
    setWorkScheduleMode("COMPANY");
    setShiftCode("A");
    setWorkStartTime("09:00");
    setWorkEndTime("18:00");
  }

  function openAddForm() {
    setFormMode({ kind: "add" });
    resetFormFields();
    setError(null);
    setSaved(false);
  }

  function openEditForm(site: SiteRow) {
    setFormMode({ kind: "edit", id: site.id });
    setName(site.name);
    setCoordFields(site.latitude, site.longitude);
    setAllowedRadius(String(site.allowedRadius));
    setDepartmentIds(new Set(site.departmentIds));
    setWorkScheduleMode(
      site.workScheduleMode === "SHIFT" || site.workScheduleMode === "CUSTOM"
        ? site.workScheduleMode
        : "COMPANY"
    );
    setShiftCode(
      site.shiftCode === "B" || site.shiftCode === "C" ? site.shiftCode : "A"
    );
    setWorkStartTime(site.workStartTime ?? "09:00");
    setWorkEndTime(site.workEndTime ?? "18:00");
    setError(null);
    setSaved(false);
  }

  function closeForm() {
    setFormMode({ kind: "closed" });
    setCoordFields(null, null);
    setError(null);
    setSaved(false);
  }

  function toggleDepartment(id: string) {
    setDepartmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function readPositionOnce(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t("admin.siteGeoUnsupported")));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    });
  }

  async function captureCurrentLocation() {
    if (!canEdit || locating) return;
    setLocating(true);
    setError(null);
    setSaved(false);
    try {
      const pos = await readPositionOnce();
      setCoordFields(pos.coords.latitude, pos.coords.longitude);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : t("admin.siteGeoFail");
      setError(msg);
    }
    setLocating(false);
  }

  async function saveSite() {
    if (!canEdit || saving || formMode.kind === "closed") return;
    if (!name.trim()) {
      setError(t("admin.siteNameRequired"));
      return;
    }
    const lat = parseLatitude(latInput);
    const lng = parseLongitude(lngInput);
    if (lat == null || lng == null) {
      setError(t("admin.siteCoordsInvalid"));
      return;
    }
    const radius = Number(allowedRadius);
    if (!Number.isFinite(radius) || radius < 50 || radius > 2000) {
      setError(t("admin.siteRadiusInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const body = {
      name: name.trim(),
      latitude: lat,
      longitude: lng,
      allowedRadius: radius,
      departmentIds: [...departmentIds],
      workScheduleMode,
      shiftCode: workScheduleMode === "SHIFT" ? shiftCode : null,
      workStartTime: workScheduleMode === "CUSTOM" ? workStartTime : null,
      workEndTime: workScheduleMode === "CUSTOM" ? workEndTime : null,
    };

    const isEdit = formMode.kind === "edit";
    const r = await fetch("/api/admin/site", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { ...body, id: formMode.id } : body),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      const err = j.error as string | { fieldErrors?: Record<string, string[]> } | undefined;
      if (typeof err === "string") setError(err);
      else setError(t("admin.siteSaveFail"));
      return;
    }
    setSaved(true);
    setFormMode({ kind: "closed" });
    await load();
  }

  async function deleteSite(site: SiteRow) {
    if (!canEdit || deletingId) return;
    if (!window.confirm(t("admin.siteDeleteConfirm").replace("{name}", site.name))) return;
    setDeletingId(site.id);
    setError(null);
    setSaved(false);
    const r = await fetch(`/api/admin/site?id=${encodeURIComponent(site.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setDeletingId(null);
    if (!r.ok) {
      setError(typeof j.error === "string" ? j.error : t("admin.siteDeleteFail"));
      return;
    }
    if (formMode.kind === "edit" && formMode.id === site.id) {
      closeForm();
    }
    await load();
  }

  function departmentNames(ids: string[]): string {
    if (ids.length === 0) return t("admin.siteDepartmentsAll");
    const names = ids
      .map((id) => departments.find((d) => d.id === id)?.name)
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : t("admin.siteDepartmentsAll");
  }

  const formOpen = formMode.kind !== "closed";
  const displayCoords = coords;

  return (
    <section>
      <p className={sectionLabel}>{t("admin.siteTitle")}</p>
      <div className={groupedCard}>
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-[0.9375rem] leading-relaxed text-[var(--apple-label-secondary)]">
            {t("admin.siteLead")}
          </p>

          {loading ? (
            <p className={`mt-4 text-[0.875rem] ${hint}`}>{t("common.loading")}</p>
          ) : (
            <>
              {sites.length > 0 && (
                <p className="mt-3 text-[0.8125rem] text-[var(--apple-label-secondary)]">
                  {t("admin.siteCount").replace("{count}", String(sites.length))}
                  {" · "}
                  {t("admin.siteNearestHint")}
                </p>
              )}

              {sites.length > 0 && (
                <ul className="mt-4 divide-y divide-[var(--apple-separator)] rounded-xl border border-[var(--apple-separator)]">
                  {sites.map((site) => (
                    <li key={site.id} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[var(--apple-label)]">{site.name}</p>
                          <p className={`mt-0.5 text-[0.8125rem] ${hint}`}>
                            {t("admin.siteCoordsHint")
                              .replace("{lat}", site.latitude.toFixed(6))
                              .replace("{lng}", site.longitude.toFixed(6))}
                          </p>
                          <p className={`mt-0.5 text-[0.8125rem] ${hint}`}>
                            {t("admin.siteRadiusHint").replace("{m}", String(Math.round(site.allowedRadius)))}
                            {" · "}
                            {scheduleSummary(site, t)}
                          </p>
                          <p className={`mt-0.5 text-[0.8125rem] ${hint}`}>
                            {t("admin.siteDepartmentsLabel")}: {departmentNames(site.departmentIds)}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              className={btnSecondary}
                              onClick={() => openEditForm(site)}
                              disabled={saving || locating || deletingId !== null}
                            >
                              {t("admin.siteEdit")}
                            </button>
                            <button
                              type="button"
                              className={`${btnSecondary} text-red-600`}
                              onClick={() => void deleteSite(site)}
                              disabled={
                                saving || locating || deletingId === site.id || deletingId !== null
                              }
                            >
                              {deletingId === site.id ? t("admin.siteDeleting") : t("admin.siteDelete")}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {sites.length === 0 && !formOpen && (
                <p className={`mt-4 text-[0.875rem] ${hint}`}>{t("admin.siteListEmpty")}</p>
              )}

              {canEdit && !formOpen && (
                <button
                  type="button"
                  className={`${btnSecondary} mt-4`}
                  onClick={openAddForm}
                  disabled={saving || locating || deletingId !== null}
                >
                  {t("admin.siteAdd")}
                </button>
              )}

              {formOpen && (
                <div className="mt-5 space-y-4 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-fill-quaternary)] px-4 py-4 sm:px-5">
                  <p className="text-[0.875rem] font-medium text-[var(--apple-label)]">
                    {formMode.kind === "add" ? t("admin.siteAdd") : t("admin.siteEdit")}
                  </p>

                  <div>
                    <label className={label} htmlFor="site-name">
                      {t("admin.siteNameLabel")}
                    </label>
                    <GooglePlaceAutocompleteInput
                      id="site-name"
                      value={name}
                      onChange={setName}
                      onPlaceSelect={(place) => {
                        setName(place.name);
                        setCoordFields(place.lat, place.lng);
                      }}
                      disabled={!canEdit || saving}
                      maxLength={120}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="site-lat">
                        {t("admin.siteLatitudeLabel")}
                      </label>
                      <input
                        id="site-lat"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className={`${input} mt-1.5`}
                        value={latInput}
                        onChange={(e) => applyCoordInputs(e.target.value, lngInput)}
                        disabled={!canEdit || saving}
                        placeholder="12.978532"
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="site-lng">
                        {t("admin.siteLongitudeLabel")}
                      </label>
                      <input
                        id="site-lng"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className={`${input} mt-1.5`}
                        value={lngInput}
                        onChange={(e) => applyCoordInputs(latInput, e.target.value)}
                        disabled={!canEdit || saving}
                        placeholder="77.697013"
                      />
                    </div>
                  </div>
                  <p className={`text-[0.75rem] ${hint}`}>{t("admin.siteCoordsManualHint")}</p>

                  <div>
                    <label className={label} htmlFor="site-radius">
                      {t("admin.siteRadiusLabel")}
                    </label>
                    <input
                      id="site-radius"
                      type="number"
                      min={50}
                      max={2000}
                      className={`${input} mt-1.5 max-w-[10rem]`}
                      value={allowedRadius}
                      onChange={(e) => setAllowedRadius(e.target.value)}
                      disabled={!canEdit || saving}
                    />
                    <p className={`mt-1 ${hint}`}>{t("admin.siteRadiusFieldHint")}</p>
                  </div>

                  {departments.length > 0 && (
                    <div>
                      <p className={label}>{t("admin.siteDepartmentsLabel")}</p>
                      <p className={`mt-0.5 text-[0.75rem] ${hint}`}>{t("admin.siteDepartmentsHint")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {departments.map((d) => (
                          <label
                            key={d.id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--apple-separator)] px-3 py-1.5 text-[0.8125rem]"
                          >
                            <input
                              type="checkbox"
                              checked={departmentIds.has(d.id)}
                              onChange={() => toggleDepartment(d.id)}
                              disabled={!canEdit || saving}
                            />
                            {d.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={label} htmlFor="site-schedule-mode">
                      {t("admin.siteScheduleModeLabel")}
                    </label>
                    <select
                      id="site-schedule-mode"
                      className={`${select} mt-1.5`}
                      value={workScheduleMode}
                      onChange={(e) => setWorkScheduleMode(e.target.value as WorkScheduleMode)}
                      disabled={!canEdit || saving}
                    >
                      <option value="COMPANY">{t("admin.siteScheduleCompany")}</option>
                      <option value="SHIFT">{t("admin.siteScheduleShiftOption")}</option>
                      <option value="CUSTOM">{t("admin.siteScheduleCustomOption")}</option>
                    </select>
                    <p className={`mt-1 ${hint}`}>{t("admin.siteScheduleModeHint")}</p>
                  </div>

                  {workScheduleMode === "SHIFT" && (
                    <div>
                      <label className={label} htmlFor="site-shift">
                        {t("admin.siteShiftLabel")}
                      </label>
                      <select
                        id="site-shift"
                        className={`${select} mt-1.5 max-w-[12rem]`}
                        value={shiftCode}
                        onChange={(e) =>
                          setShiftCode(e.target.value as (typeof SHIFT_CODES)[number])
                        }
                        disabled={!canEdit || saving}
                      >
                        {SHIFT_CODES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {workScheduleMode === "CUSTOM" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={label}>{t("admin.settingsWorkStart")}</span>
                        <LocaleTimeInput
                          value={workStartTime}
                          onChange={setWorkStartTime}
                          disabled={!canEdit || saving}
                          ariaLabel={t("admin.settingsWorkStart")}
                          className="mt-1.5"
                        />
                      </label>
                      <label className="block">
                        <span className={label}>{t("admin.settingsWorkEnd")}</span>
                        <LocaleTimeInput
                          value={workEndTime}
                          onChange={setWorkEndTime}
                          disabled={!canEdit || saving}
                          ariaLabel={t("admin.settingsWorkEnd")}
                          className="mt-1.5"
                        />
                      </label>
                    </div>
                  )}

                  {displayCoords && (
                    <StaticMap
                      lat={displayCoords.lat}
                      lng={displayCoords.lng}
                      label={name.trim() || t("admin.siteDefaultName")}
                      noKeyFallback="embed"
                      className="mt-2"
                    />
                  )}

                  {canEdit && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => void captureCurrentLocation()}
                        disabled={locating || saving}
                      >
                        {locating ? t("admin.siteLocating") : t("admin.siteUseCurrentLocation")}
                      </button>
                      <button
                        type="button"
                        className={btnPrimary}
                        onClick={() => void saveSite()}
                        disabled={saving || locating}
                      >
                        {saving
                          ? t("admin.siteSaving")
                          : formMode.kind === "add"
                            ? t("admin.siteRegister")
                            : t("admin.siteUpdate")}
                      </button>
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={closeForm}
                        disabled={saving || locating}
                      >
                        {t("admin.siteCancel")}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!canEdit && sites.length > 0 && (
                <p className={`mt-3 text-[0.8125rem] ${hint}`}>{t("admin.siteReadOnly")}</p>
              )}

              {error && <p className={`mt-3 text-[0.875rem] ${errorText}`}>{error}</p>}
              {saved && <p className={`mt-3 text-[0.875rem] ${successText}`}>{t("admin.siteSaved")}</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
