import { distanceMeters } from "@/lib/haversine";

/** 회사 근무지 기본 허용 반경 (m) */
export const DEFAULT_SITE_RADIUS_M = 200;

export type GeofenceMode = "OFF" | "WARN" | "BLOCK";

export function parseGeofenceMode(raw: string | null | undefined): GeofenceMode {
  if (raw === "WARN" || raw === "BLOCK") return raw;
  return "OFF";
}

export type CompanySite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadius: number;
};

export type SiteWithDepartments = CompanySite & {
  departmentIds: string[];
};

export function computeDistanceFromSite(
  site: Pick<CompanySite, "latitude" | "longitude">,
  latitude: number,
  longitude: number
): number {
  return distanceMeters(site.latitude, site.longitude, latitude, longitude);
}

/** 여러 근무지 중 출퇴근 좌표와 가장 가까운 곳 */
export function pickNearestSite(
  sites: CompanySite[],
  latitude: number,
  longitude: number
): { site: CompanySite; distanceMeters: number } | null {
  if (sites.length === 0) return null;
  let best = sites[0]!;
  let bestDist = computeDistanceFromSite(best, latitude, longitude);
  for (let i = 1; i < sites.length; i++) {
    const s = sites[i]!;
    const d = computeDistanceFromSite(s, latitude, longitude);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return { site: best, distanceMeters: bestDist };
}

/** 부서 배정이 있는 근무지만 필터. 매칭 없으면 전체 근무지 사용(하위 호환) */
export function filterSitesForEmployee(
  sites: SiteWithDepartments[],
  employeeDepartmentId: string | null
): CompanySite[] {
  const eligible = sites.filter((s) => {
    if (s.departmentIds.length === 0) return true;
    if (!employeeDepartmentId) return false;
    return s.departmentIds.includes(employeeDepartmentId);
  });
  const pool = eligible.length > 0 ? eligible : sites;
  return pool.map(({ id, name, latitude, longitude, allowedRadius }) => ({
    id,
    name,
    latitude,
    longitude,
    allowedRadius,
  }));
}

export function isWithinSiteRadius(
  site: Pick<CompanySite, "latitude" | "longitude" | "allowedRadius">,
  latitude: number,
  longitude: number
): { ok: true; distanceMeters: number } | { ok: false; distanceMeters: number; allowedRadius: number } {
  const distance = computeDistanceFromSite(site, latitude, longitude);
  if (distance <= site.allowedRadius) {
    return { ok: true, distanceMeters: distance };
  }
  return { ok: false, distanceMeters: distance, allowedRadius: site.allowedRadius };
}

export function geofenceErrorMessage(distance: number, allowedRadius: number): string {
  return `근무지 반경 ${Math.round(allowedRadius)}m 밖입니다. 현재 위치는 약 ${Math.round(distance)}m 떨어져 있습니다.`;
}

export type GeofenceCheckResult =
  | { action: "allow"; outsideGeofence: false }
  | { action: "allow"; outsideGeofence: true; warning: true }
  | { action: "warn"; outsideGeofence: true; distanceMeters: number; allowedRadius: number; siteName: string }
  | { action: "block"; outsideGeofence: true; distanceMeters: number; allowedRadius: number; siteName: string };

/** 출퇴근 반경 정책 적용 */
export function checkGeofencePolicy(
  mode: GeofenceMode,
  site: CompanySite | null,
  latitude: number,
  longitude: number,
  options: { skip: boolean; acknowledgeGeofence: boolean }
): GeofenceCheckResult {
  if (options.skip || mode === "OFF" || !site) {
    return { action: "allow", outsideGeofence: false };
  }

  const radiusCheck = isWithinSiteRadius(site, latitude, longitude);
  if (radiusCheck.ok) {
    return { action: "allow", outsideGeofence: false };
  }

  if (mode === "BLOCK") {
    return {
      action: "block",
      outsideGeofence: true,
      distanceMeters: radiusCheck.distanceMeters,
      allowedRadius: radiusCheck.allowedRadius,
      siteName: site.name,
    };
  }

  if (mode === "WARN" && !options.acknowledgeGeofence) {
    return {
      action: "warn",
      outsideGeofence: true,
      distanceMeters: radiusCheck.distanceMeters,
      allowedRadius: radiusCheck.allowedRadius,
      siteName: site.name,
    };
  }

  return { action: "allow", outsideGeofence: true, warning: true };
}
