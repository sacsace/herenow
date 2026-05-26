"use client";

import { FaceCapture } from "@/components/employee/FaceCapture";
import { StaticMap } from "@/components/admin/StaticMap";
import { AttendanceTrustHero } from "@/components/ui/AttendanceTrustHero";
import { useI18n } from "@/components/LanguageProvider";
import { statusBadge } from "@/lib/statusBadge";
import {
  bannerInfo,
  bannerWarning,
  btnPrimary,
  btnSecondary,
  btnSuccessFull,
  card,
  cardBody,
  cardHeader,
  groupedCard,
  groupedRow,
  hint,
  input,
  label,
  segmentedBtn,
  segmentedWrap,
  successText,
} from "@/lib/uiStyles";
import { usePunchStatus } from "@/hooks/usePunchStatus";
import type { AttendanceType } from "@prisma/client";
import { useCallback, useEffect, useRef, useState } from "react";

type RecordRow = {
  id: string;
  type: AttendanceType;
  timestamp: string;
  status: string;
  distanceFromSite: number;
  latitude: number;
  longitude: number;
  memo: string | null;
  isBusinessTrip: boolean;
  businessTripLocation: string | null;
  businessTripReason: string | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  isHolidayWork: boolean;
  overtimeMinutes: number;
  site: { name: string } | null;
  exception: { status: string } | null;
};

type PunchCardProps = {
  /** full: employee page · embedded: admin (no hero) */
  variant?: "full" | "embedded";
  showRecentRecords?: boolean;
};

export function PunchCard({ variant = "full", showRecentRecords }: PunchCardProps) {
  const embedded = variant === "embedded";
  const showRecords = showRecentRecords ?? !embedded;
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-US" : "ko-KR";
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [checkInMode, setCheckInMode] = useState<"normal" | "businessTrip">("normal");
  const [businessTripLocation, setBusinessTripLocation] = useState("");
  const [businessTripReason, setBusinessTripReason] = useState("");
  const [earlyLeaveReason, setEarlyLeaveReason] = useState("");
  const [memo, setMemo] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [faceRecognitionEnabled, setFaceRecognitionEnabled] = useState<boolean | null>(null);
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewCoords, setPreviewCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const { status: punchStatus, loading: punchStatusLoading, reload: reloadPunchStatus } =
    usePunchStatus();

  function checkInBlockMessage(): string | null {
    if (!punchStatus?.checkInBlock) return punchStatus?.checkInMessage ?? null;
    if (punchStatus.checkInBlock === "ALREADY_CHECKED_IN") return t("employee.alreadyCheckedIn");
    if (punchStatus.checkInBlock === "COOLDOWN") return t("employee.cooldownBlocked");
    return punchStatus.checkInMessage;
  }

  const loadFaceStatus = useCallback(async () => {
    const r = await fetch("/api/employee/face");
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const enabled = Boolean((j as { faceRecognitionEnabled?: boolean }).faceRecognitionEnabled);
      setFaceRecognitionEnabled(enabled);
      setFaceEnrolled(
        enabled ? Boolean((j as { enrolled?: boolean }).enrolled) : true
      );
    } else {
      setFaceRecognitionEnabled(true);
      setFaceEnrolled(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    const r = await fetch("/api/attendance/me?limit=20");
    const j = await r.json();
    if (r.ok) setRecords(j.records ?? []);
  }, []);

  useEffect(() => {
    void loadFaceStatus();
    void loadRecords();
  }, [loadFaceStatus, loadRecords]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function clearPhoto() {
    setPhotoFile(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function onPhotoSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg(t("employee.photoInvalidType"));
      return;
    }
    if (file.size > 900_000) {
      setMsg(t("employee.photoTooLarge"));
      clearPhoto();
      return;
    }
    setMsg(null);
    setPhotoFile(file);
  }

  function readPositionOnce(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        reject(new Error(t("employee.geoInsecureContext")));
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error(t("employee.geoUnsupported")));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          // iOS Safari 의 권한 거부/측위 실패에 사람이 읽을 수 있는 메시지 부여
          let msg = t("employee.geoFail");
          if (err && typeof err === "object" && "code" in err) {
            const code = (err as GeolocationPositionError).code;
            if (code === 1) msg = t("employee.geoPermissionDenied");
            else if (code === 2) msg = t("employee.geoPositionUnavailable");
            else if (code === 3) msg = t("employee.geoTimeout");
          }
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        }
      );
    });
  }

  async function fileToDataUrl(f: File): Promise<string | null> {
    if (f.size > 900_000) {
      setMsg(t("employee.photoTooLarge"));
      return null;
    }
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => reject(new Error("read fail"));
      r.readAsDataURL(f);
    });
  }

  async function loadMapPreview() {
    setMapBusy(true);
    setMsg(null);
    try {
      const pos = await readPositionOnce();
      setPreviewCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        setMsg(String((e as { message?: string }).message));
      } else {
        setMsg(t("employee.geoFail"));
      }
    }
    setMapBusy(false);
  }

  function validateBusinessTripFields(): boolean {
    if (checkInMode !== "businessTrip") return true;
    if (!businessTripReason.trim()) {
      setMsg(t("employee.businessTripReasonRequired"));
      return false;
    }
    return true;
  }

  async function submitCheckIn(faceDescriptor?: number[]) {
    if (!punchStatus?.canCheckIn) {
      setMsg(checkInBlockMessage() ?? t("employee.alreadyCheckedIn"));
      return;
    }
    if (!validateBusinessTripFields()) return;

    setMsg(null);
    setBusy(true);
    try {
      const pos = await readPositionOnce();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      setPreviewCoords({ lat, lng });

      let photoUrl: string | null = null;
      if (photoFile) {
        photoUrl = await fileToDataUrl(photoFile);
        if (!photoUrl) {
          setBusy(false);
          return;
        }
      }
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CHECK_IN",
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          isBusinessTrip: checkInMode === "businessTrip",
          businessTripLocation:
            checkInMode === "businessTrip" ? businessTripLocation.trim() : undefined,
          businessTripReason:
            checkInMode === "businessTrip" ? businessTripReason.trim() : undefined,
          memo: checkInMode === "normal" ? memo.trim() || undefined : undefined,
          photoUrl: photoUrl || undefined,
          ...(faceDescriptor ? { faceDescriptor } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = j.error as unknown;
        setMsg(
          typeof err === "string"
            ? err
            : err != null
              ? JSON.stringify(err)
              : "저장에 실패했습니다."
        );
        setBusy(false);
        return;
      }
      setMsg(j.message ?? "저장되었습니다.");
      setMemo("");
      setBusinessTripLocation("");
      setBusinessTripReason("");
      setCheckInMode("normal");
      clearPhoto();
      await loadRecords();
      await reloadPunchStatus();
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        setMsg(String((e as { message?: string }).message));
      } else {
        setMsg("위치를 가져오지 못했거나 네트워크 오류가 발생했습니다.");
      }
    }
    setBusy(false);
  }

  async function submitCheckOut() {
    // 조퇴(정규 퇴근시각 이전 퇴근) 인 경우 사유 필수 — 클라이언트 선검증으로 즉시 안내
    if (punchStatus?.earlyLeaveExpected && !earlyLeaveReason.trim()) {
      setMsg(t("employee.earlyLeaveReasonRequired"));
      return;
    }

    setMsg(null);
    setBusy(true);
    try {
      const pos = await readPositionOnce();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      setPreviewCoords({ lat, lng });

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CHECK_OUT",
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          memo: memo.trim() || undefined,
          earlyLeaveReason: earlyLeaveReason.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 서버가 사유를 요구하는 케이스 — 사용자에게 입력 안내
        if (j.code === "EARLY_LEAVE_REASON_REQUIRED") {
          setMsg(t("employee.earlyLeaveReasonRequired"));
          setBusy(false);
          await reloadPunchStatus();
          return;
        }
        const err = j.error as unknown;
        setMsg(
          typeof err === "string"
            ? err
            : err != null
              ? JSON.stringify(err)
              : t("employee.saveFail")
        );
        setBusy(false);
        return;
      }
      setMsg(j.message ?? t("employee.saved"));
      setMemo("");
      setEarlyLeaveReason("");
      await loadRecords();
      await reloadPunchStatus();
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        setMsg(String((e as { message?: string }).message));
      } else {
        setMsg(t("employee.saveFail"));
      }
    }
    setBusy(false);
  }

  const faceRequired = faceRecognitionEnabled !== false;
  const faceStatusReady = faceRecognitionEnabled !== null && faceEnrolled !== null;
  const readyForPunch =
    faceStatusReady && (!faceRequired || faceEnrolled === true);
  const canCheckIn = Boolean(punchStatus?.canCheckIn);
  const canCheckOut = Boolean(punchStatus?.canCheckOut);
  const showCheckIn = readyForPunch && canCheckIn && !punchStatusLoading;
  /**
   * 등록 단계는 readyForPunch 가 false 일 수밖에 없으므로(faceEnrolled !== true),
   * showCheckIn 대신 canCheckIn + 상태 로드 완료 조건만으로 노출한다.
   * (이전 로직은 등록되지 않은 사용자에게 등록 화면이 영영 보이지 않는 버그가 있었음)
   */
  const showFaceEnroll =
    faceRequired &&
    faceStatusReady &&
    faceEnrolled === false &&
    canCheckIn &&
    !punchStatusLoading;
  const checkInNotice = checkInBlockMessage();

  return (
    <div className={embedded ? "min-w-0" : "min-w-0 space-y-6 sm:space-y-8"}>
      {!embedded && <AttendanceTrustHero variant="employee" />}

      <section className={card}>
        <div className={cardHeader}>
          <p className="text-[0.9375rem] font-semibold text-[var(--foreground)]">{t("employee.punchSection")}</p>
          <p className="mt-0.5 text-[0.75rem] text-[var(--apple-label-secondary)]">
            {faceRequired ? t("employee.checkInLeadWithFace") : t("employee.checkInLeadNoFace")}
          </p>
        </div>

        <div className={cardBody}>
        {punchStatusLoading && (
          <p className="text-[0.9375rem] text-[var(--apple-label-secondary)]">{t("common.loading")}</p>
        )}

        {!punchStatusLoading && punchStatus?.isCheckedIn && (
          <p className={`${bannerInfo} mt-4`}>{t("employee.alreadyCheckedIn")}</p>
        )}

        {!punchStatusLoading && !canCheckIn && checkInNotice && !punchStatus?.isCheckedIn && (
          <p className={`${bannerInfo} mt-4`}>{checkInNotice}</p>
        )}

        {faceRecognitionEnabled === null && !punchStatusLoading && (
          <p className="text-[0.9375rem] text-[var(--apple-label-secondary)]">{t("common.loading")}</p>
        )}

        {showFaceEnroll && (
          <div className="mt-4">
            <FaceCapture
              mode="enroll"
              disabled={busy}
              onEnrolled={() => {
                setFaceEnrolled(true);
                setMsg(t("employee.faceEnrollOk"));
              }}
              onError={setMsg}
            />
          </div>
        )}

        {showCheckIn && (
          <>
            <div className={`mt-4 ${segmentedWrap}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCheckInMode("normal")}
                className={segmentedBtn(checkInMode === "normal")}
              >
                {t("employee.checkInModeNormal")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCheckInMode("businessTrip")}
                className={segmentedBtn(checkInMode === "businessTrip")}
              >
                {t("employee.checkInModeBusinessTrip")}
              </button>
            </div>

            {checkInMode === "businessTrip" && (
              <div className={`mt-4 space-y-3 border-t border-[var(--separator)] pt-4 ${bannerWarning}`}>
                <p className="!bg-transparent !p-0 text-[0.8125rem]">
                  {faceRequired ? t("employee.businessTripHint") : t("employee.businessTripHintNoFace")}
                </p>
                <label className={label}>
                  {t("employee.businessTripLocationLabel")}
                  <span className="text-[var(--apple-red)]"> *</span>
                </label>
                <input
                  type="text"
                  className={input}
                  value={businessTripLocation}
                  onChange={(e) => setBusinessTripLocation(e.target.value)}
                  placeholder={t("employee.businessTripLocationPlaceholder")}
                  maxLength={200}
                  disabled={busy}
                />
                <label className={label}>
                  {t("employee.businessTripReasonLabel")}
                  <span className="text-[var(--apple-red)]"> *</span>
                </label>
                <textarea
                  className={`${input} min-h-[5rem]`}
                  rows={3}
                  value={businessTripReason}
                  onChange={(e) => setBusinessTripReason(e.target.value)}
                  placeholder={t("employee.businessTripReasonPlaceholder")}
                  maxLength={2000}
                  disabled={busy}
                />
              </div>
            )}

            {faceRequired ? (
              <div className="mt-4">
                <FaceCapture
                  mode="verify"
                  disabled={busy}
                  onVerified={(descriptor) => void submitCheckIn(descriptor)}
                  onError={setMsg}
                />
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitCheckIn()}
                  className={btnSuccessFull}
                >
                  {t("employee.checkInButton")}
                </button>
              </div>
            )}
          </>
        )}

        {readyForPunch && checkInMode === "normal" && (
          <>
            <div className="mt-4 border-t border-[var(--separator)] pt-4">
            <label className={label}>{t("employee.memoOptional")}</label>
            <textarea
              className={`${input} mt-1.5`}
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("employee.memoPlaceholder")}
            />
            </div>
          </>
        )}

        {showCheckIn && (
          <div className="mt-4 border-t border-[var(--separator)] pt-4">
            <p className="text-[0.9375rem] font-semibold text-[var(--foreground)]">{t("employee.photoCheckInLabel")}</p>
            <p className={`mt-0.5 ${hint}`}>{t("employee.photoAttached")}</p>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
            />
            {!photoPreviewUrl ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => photoInputRef.current?.click()}
                className={`mt-3 flex min-h-[2.75rem] w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--separator-opaque)] bg-[var(--grouped-bg)] py-2.5 text-sm font-medium text-[var(--foreground)] active:bg-[var(--fill-tertiary)] disabled:opacity-50`}
              >
                <CameraIcon />
                {t("employee.photoTakeButton")}
              </button>
            ) : (
              <div className="mt-3 space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="mx-auto max-h-40 w-full rounded-xl object-contain ring-1 ring-black/[0.06]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => photoInputRef.current?.click()}
                    className={`${btnSecondary} w-full py-2.5 text-[0.9375rem]`}
                  >
                    {t("employee.photoRetake")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={clearPhoto}
                    className={`${btnSecondary} w-full py-2.5 text-[0.9375rem] text-[var(--apple-red)]`}
                  >
                    {t("employee.photoRemove")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-[var(--separator)] pt-4">
          <p className="text-[0.9375rem] font-semibold text-[var(--foreground)]">{t("employee.locationMap")}</p>
          <p className={`mt-0.5 ${hint}`}>{t("employee.locationMapLead")}</p>
          <button
            type="button"
            disabled={busy || mapBusy}
            onClick={() => void loadMapPreview()}
            className={`mt-2 ${btnSecondary}`}
          >
            {mapBusy ? t("employee.readingLocation") : t("employee.showOnMap")}
          </button>
          {previewCoords && (
            <div className="mt-3">
              <StaticMap
                lat={previewCoords.lat}
                lng={previewCoords.lng}
                label={t("employee.currentLocation")}
                noKeyFallback="embed"
              />
              <p className="mt-1 break-all text-[0.6875rem] text-[var(--apple-label-tertiary)]">
                {previewCoords.lat.toFixed(6)}, {previewCoords.lng.toFixed(6)}
              </p>
            </div>
          )}
        </div>

        {canCheckOut && !punchStatusLoading && (
          <div className="mt-6 border-t border-[var(--separator)] pt-5">
            {punchStatus?.earlyLeaveExpected && (
              <div className={`${bannerWarning} mb-3 space-y-2`}>
                <p className="!bg-transparent !p-0 text-[0.8125rem] font-semibold">
                  {punchStatus.workEndTime
                    ? t("employee.earlyLeaveNoticeWithTime").replace(
                        "{time}",
                        punchStatus.workEndTime
                      )
                    : t("employee.earlyLeaveNotice")}
                </p>
                <label className={label}>
                  {t("employee.earlyLeaveReasonLabel")}
                  <span className="text-[var(--apple-red)]"> *</span>
                </label>
                <textarea
                  className={`${input} min-h-[5rem]`}
                  rows={3}
                  value={earlyLeaveReason}
                  onChange={(e) => setEarlyLeaveReason(e.target.value)}
                  placeholder={t("employee.earlyLeaveReasonPlaceholder")}
                  maxLength={2000}
                  disabled={busy}
                />
              </div>
            )}
            <button
              type="button"
              disabled={
                busy ||
                (Boolean(punchStatus?.earlyLeaveExpected) && !earlyLeaveReason.trim())
              }
              onClick={() => void submitCheckOut()}
              className={btnPrimary + " w-full min-h-[3rem] py-3.5 text-[1.0625rem] sm:min-h-[3.25rem]"}
            >
              {punchStatus?.earlyLeaveExpected
                ? t("employee.earlyLeaveSubmitButton")
                : t("employee.checkOutOnly")}
            </button>
          </div>
        )}

        {msg && <p className={`mt-3 break-words text-center ${successText}`}>{msg}</p>}
        </div>
      </section>

      {showRecords && (
      <section>
        <p className="mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--apple-label-secondary)]">
          {t("employee.recentRecords")}
        </p>
        <ul className={groupedCard}>
          {records.map((r, i) => (
            <li
              key={r.id}
              className={`${groupedRow} text-[0.875rem] ${i < records.length - 1 ? "border-b border-[var(--separator)]" : ""}`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-[var(--foreground)]">
                  {r.type === "CHECK_IN" ? t("employee.recordCheckIn") : t("employee.recordCheckOut")}
                  {r.isBusinessTrip && r.businessTripLocation
                    ? ` · ${t("employee.recordBusinessTrip")} ${r.businessTripLocation}`
                    : r.site?.name
                      ? ` · ${r.site.name}`
                      : ""}
                </span>
                <span className={statusBadge(r.status)}>{r.status}</span>
              </div>
              <p className="mt-1 break-words text-[0.75rem] text-[var(--apple-label-secondary)]">
                {new Date(r.timestamp).toLocaleString(dateLocale)}
                {r.site && r.distanceFromSite > 0
                  ? ` · ${t("employee.recordDistance").replace("{m}", String(Math.round(r.distanceFromSite)))}`
                  : ` · ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`}
              </p>
              {(r.isHolidayWork || r.isLate || r.isEarlyLeave || r.isOvertime) && (
                <p className="text-xs text-[var(--apple-label-secondary)]">
                  {r.isHolidayWork && (
                    <span className="text-violet-700">{t("employee.flagHolidayWork")} </span>
                  )}
                  {r.isLate && (
                    <span className="text-amber-800">{t("employee.flagLate")} </span>
                  )}
                  {r.isEarlyLeave && (
                    <span className="text-amber-800">{t("employee.flagEarlyLeave")} </span>
                  )}
                  {r.isOvertime && (
                    <span className="text-[var(--apple-blue)]">
                      {t("employee.flagOvertime")}
                      {r.overtimeMinutes > 0 ? ` ${r.overtimeMinutes}${t("employee.flagMinutes")}` : ""}{" "}
                    </span>
                  )}
                </p>
              )}
              {r.isBusinessTrip && r.businessTripReason && (
                <p className="text-xs text-[var(--apple-label-secondary)]">
                  {t("employee.recordReason")}: {r.businessTripReason}
                </p>
              )}
              {r.exception && (
                <p className="text-xs text-[var(--apple-label-secondary)]">
                  {t("employee.recordException")}: {r.exception.status}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
