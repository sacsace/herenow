"use client";

import { useI18n } from "@/components/LanguageProvider";
import { link, mapSurface } from "@/lib/uiStyles";

type StaticMapProps = {
  lat: number;
  lng: number;
  label?: string;
  className?: string;
  /** 키 없음: link=텍스트 링크만(기본), embed=Google 지도 iframe */
  noKeyFallback?: "link" | "embed";
};

/**
 * Google 지도 미리보기
 * - `NEXT_PUBLIC_GOOGLE_MAPS_KEY` 있으면 Static Maps 이미지
 * - 없으면 `noKeyFallback`: 링크만 또는 iframe 임베드(추가 API 키 불필요)
 */
export function StaticMap({ lat, lng, label, className, noKeyFallback = "link" }: StaticMapProps) {
  const { t, locale } = useI18n();
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const openUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const hl = locale === "en" ? "en" : "ko";

  if (!key) {
    if (noKeyFallback === "embed") {
      const embedSrc = `https://maps.google.com/maps?q=${lat},${lng}&hl=${hl}&z=16&output=embed`;
      return (
        <div className={className}>
          <div className={mapSurface}>
            <iframe
              title={label ?? t("common.mapEmbedTitle")}
              src={embedSrc}
              className="h-[clamp(11rem,36vh,22rem)] w-full max-w-full sm:h-[clamp(12rem,40vh,24rem)] md:h-[clamp(14rem,45vh,26rem)]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <a href={openUrl} target="_blank" rel="noreferrer" className={`mt-2 inline-block text-[0.8125rem] ${link}`}>
            {t("common.mapOpenLargeLink")}
          </a>
        </div>
      );
    }
    return (
      <a
        href={openUrl}
        target="_blank"
        rel="noreferrer"
        className={`text-[0.8125rem] ${link} ${className ?? ""}`}
        aria-label={label ?? t("common.mapOpenLink")}
        title={label ?? undefined}
      >
        {t("common.mapOpenLink")}
      </a>
    );
  }

  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=320x160&scale=2&markers=color:red%7C${lat},${lng}&key=${encodeURIComponent(key)}`;

  return (
    <a href={openUrl} target="_blank" rel="noreferrer" className={`block ${className ?? ""}`}>
      <div className={mapSurface}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t("common.mapPreviewAlt")} className="h-auto w-full max-w-full" />
      </div>
    </a>
  );
}
