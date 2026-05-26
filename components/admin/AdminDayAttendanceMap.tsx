"use client";

import { useI18n } from "@/components/LanguageProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type DayMapMarker = {
  employeeId: string;
  employeeName: string;
  attendanceId: string;
  timestamp: string;
  checkInTime: string;
  latitude: number;
  longitude: number;
  isBusinessTrip: boolean;
  businessTripLocation: string | null;
  businessTripReason: string | null;
};

type Props = {
  date: string;
  /** SUPER_ADMIN이 다른 회사 일자 지도를 조회할 때만 지정. */
  companyId?: string;
  className?: string;
};

export function AdminDayAttendanceMap({ date, companyId, className }: Props) {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const layerGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [markers, setMarkers] = useState<DayMapMarker[]>([]);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapInitError, setMapInitError] = useState<string | null>(null);

  const loadMarkers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cidQs = companyId ? `&companyId=${encodeURIComponent(companyId)}` : "";
    const r = await fetch(`/api/admin/dashboard/day-map?date=${encodeURIComponent(date)}${cidQs}`);
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) {
      setMarkers([]);
      setTimezone(null);
      const err = j.error;
      setError(
        typeof err === "string"
          ? err
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : t("admin.monthlyMapLoadFail")
      );
      return;
    }
    setMarkers((j as { markers?: DayMapMarker[] }).markers ?? []);
    setTimezone((j as { timezone?: string }).timezone ?? null);
  }, [date, companyId, t]);

  useEffect(() => {
    void loadMarkers();
  }, [loadMarkers]);

  useEffect(() => {
    if (loading || !mapContainerRef.current) return;

    let cancelled = false;

    void (async () => {
      setMapInitError(null);
      let L: typeof import("leaflet");
      try {
        L = await import("leaflet");
      } catch (e) {
        if (!cancelled) {
          setMapInitError(
            e instanceof Error ? e.message : "지도 라이브러리를 불러오지 못했습니다."
          );
        }
        return;
      }

      if (cancelled || !mapContainerRef.current) return;

      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapContainerRef.current, {
          scrollWheelZoom: true,
        }).setView([37.5665, 126.978], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);
        layerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      }

      const map = mapInstanceRef.current;
      const group = layerGroupRef.current;
      if (!map || !group) return;

      group.clearLayers();

      if (markers.length === 0) {
        map.setView([37.5665, 126.978], 6);
        return;
      }

      const bounds = L.latLngBounds([]);
      const palette = ["#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FF3B30", "#5856D6"];

      markers.forEach((m, i) => {
        const latLng = L.latLng(m.latitude, m.longitude);
        bounds.extend(latLng);
        const color = palette[i % palette.length];
        const marker = L.circleMarker(latLng, {
          radius: 10,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.9,
        });
        const lines = [
          `<strong>${escapeHtml(m.employeeName)}</strong>`,
          `${t("admin.monthlyIn")} ${escapeHtml(m.checkInTime)}`,
        ];
        if (m.isBusinessTrip && m.businessTripLocation) {
          lines.push(`${t("admin.monthlyMapTrip")}: ${escapeHtml(m.businessTripLocation)}`);
        }
        if (m.isBusinessTrip && m.businessTripReason) {
          lines.push(`${t("admin.monthlyMapReason")}: ${escapeHtml(m.businessTripReason)}`);
        }
        lines.push(
          `<span class="text-xs">${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}</span>`
        );
        marker.bindPopup(lines.join("<br/>"));
        marker.addTo(group);
      });

      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2), { maxZoom: 15 });
      }
      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, markers, t]);

  useEffect(() => {
    if (loading || markers.length === 0) return;
    const id = window.setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 300);
    return () => window.clearTimeout(id);
  }, [loading, markers.length, date]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  return (
    <div className={className}>
      {loading && <p className="text-[0.9375rem] text-[var(--apple-label-secondary)]">{t("common.loading")}</p>}
      {error && <p className="text-sm text-[var(--apple-red)]">{error}</p>}
      {mapInitError && !error && (
        <p className="text-sm text-amber-800">{mapInitError}</p>
      )}
      {!loading && !error && markers.length === 0 && (
        <p className="text-[0.9375rem] text-[var(--apple-label-secondary)]">{t("admin.monthlyMapNoCheckIns")}</p>
      )}
      {!loading && !error && markers.length > 0 && (
        <>
          <p className="mb-2 text-xs text-[var(--apple-label-secondary)]">
            {t("admin.monthlyMapCountLabel")}: {markers.length}
            {timezone ? ` · ${timezone}` : ""}
          </p>
          <div
            ref={mapContainerRef}
            className={`z-0 h-[min(36rem,65vh)] w-full min-h-[21rem] rounded-2xl bg-[var(--fill-tertiary)] ring-1 ring-black/[0.04] ${mapInitError ? "hidden" : ""}`}
            aria-label={t("admin.monthlyMapTitle")}
          />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {markers.map((m) => (
              <li
                key={m.attendanceId}
                className="rounded-xl bg-[var(--fill-tertiary)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--foreground)]"
              >
                <span className="font-medium text-[var(--foreground)]">{m.employeeName}</span>
                <span className="text-[var(--apple-label-secondary)]"> · {m.checkInTime}</span>
                {m.isBusinessTrip && m.businessTripLocation && (
                  <span className="block text-amber-800">
                    {t("admin.monthlyMapTrip")}: {m.businessTripLocation}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
