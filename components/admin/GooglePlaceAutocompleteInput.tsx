"use client";

import { useI18n } from "@/components/LanguageProvider";
import { hasGoogleMapsKey, loadGoogleMapsPlaces } from "@/lib/googleMapsLoader";
import { hint, input } from "@/lib/uiStyles";
import { useEffect, useRef, useState } from "react";

export type PlaceSelection = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
};

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceSelection) => void;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
};

type PlaceGeometry = { location?: { lat(): number; lng(): number } };
type PlaceResult = {
  name?: string;
  formatted_address?: string;
  geometry?: PlaceGeometry;
};
type AutocompleteInstance = {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => PlaceResult;
};

export function GooglePlaceAutocompleteInput({
  id,
  value,
  onChange,
  onPlaceSelect,
  disabled,
  maxLength = 120,
  className,
}: Props) {
  const { t, locale } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<AutocompleteInstance | null>(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const mapsKey = hasGoogleMapsKey();

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    if (!mapsKey || disabled) return;
    const inputEl = inputRef.current;
    if (!inputEl) return;

    let cancelled = false;

    void loadGoogleMapsPlaces(locale === "en" ? "en" : "ko")
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const g = (window as Window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, opts?: object) => AutocompleteInstance } } } }).google;
        if (!g?.maps?.places?.Autocomplete) {
          setLoadError(true);
          return;
        }

        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ["name", "geometry", "formatted_address", "place_id"],
        });
        autocompleteRef.current = ac;

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          const lat = loc.lat();
          const lng = loc.lng();
          const displayName =
            place.name?.trim() || place.formatted_address?.trim() || inputRef.current?.value.trim() || "";
          if (!displayName) return;
          onPlaceSelectRef.current({
            name: displayName.slice(0, maxLength),
            lat,
            lng,
            address: place.formatted_address,
          });
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      const g = (window as Window & { google?: { maps?: { event?: { clearInstanceListeners: (i: unknown) => void } } } }).google;
      if (inputEl && g?.maps?.event?.clearInstanceListeners) {
        g.maps.event.clearInstanceListeners(inputEl);
      }
      autocompleteRef.current = null;
      setReady(false);
    };
  }, [disabled, locale, mapsKey, maxLength]);

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        className={className ?? `${input} mt-1.5`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={mapsKey ? t("admin.siteNameSearchPlaceholder") : undefined}
      />
      {mapsKey && !loadError && (
        <p className={`mt-1.5 text-[0.75rem] ${hint}`}>
          {ready ? t("admin.siteNameSearchHint") : t("common.loading")}
        </p>
      )}
      {mapsKey && loadError && (
        <p className={`mt-1.5 text-[0.75rem] text-[var(--apple-orange)]`}>
          {t("admin.sitePlacesLoadFail")}
        </p>
      )}
      {!mapsKey && (
        <p className={`mt-1.5 text-[0.75rem] ${hint}`}>{t("admin.sitePlacesNoKey")}</p>
      )}
    </div>
  );
}
