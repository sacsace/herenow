/** Google Maps JavaScript API (Places) 스크립트 단일 로드 */

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: unknown;
      event?: { clearInstanceListeners: (instance: unknown) => void };
    };
  };
};

let loadPromise: Promise<void> | null = null;

export function hasGoogleMapsKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim());
}

export function loadGoogleMapsPlaces(language?: string): Promise<void> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim();
  if (!key) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY is not set"));
  }

  const w = window as GoogleMapsWindow;
  if (w.google?.maps?.places) {
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-heresnow-google-maps="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps load failed")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.dataset.heresnowGoogleMaps = "1";
    const lang = language === "en" ? "en" : "ko";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=${lang}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps load failed"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
