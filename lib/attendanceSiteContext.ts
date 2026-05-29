import {
  filterSitesForEmployee,
  pickNearestSite,
  type CompanySite,
  type SiteWithDepartments,
} from "@/lib/siteGeofence";
import type { SiteScheduleFields } from "@/lib/siteWorkSchedule";

export type SiteForAttendance = CompanySite &
  SiteScheduleFields & {
    departmentIds: string[];
  };

export function mapSiteRow(
  site: CompanySite &
    SiteScheduleFields & {
      departments?: { departmentId: string }[];
    }
): SiteForAttendance {
  return {
    id: site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    allowedRadius: site.allowedRadius,
    workScheduleMode: site.workScheduleMode ?? "COMPANY",
    shiftCode: site.shiftCode,
    workStartTime: site.workStartTime,
    workEndTime: site.workEndTime,
    departmentIds: site.departments?.map((d) => d.departmentId) ?? [],
  };
}

export function resolvePunchSiteContext(
  sites: SiteForAttendance[],
  departmentId: string | null,
  latitude: number,
  longitude: number,
  skipSiteLink: boolean
): {
  nearestSite: SiteForAttendance | null;
  distanceFromSite: number;
  siteId: string | null;
} {
  if (skipSiteLink) {
    return { nearestSite: null, distanceFromSite: 0, siteId: null };
  }

  const filtered = filterSitesForEmployee(sites, departmentId);
  const nearest = pickNearestSite(filtered, latitude, longitude);
  if (!nearest) {
    return { nearestSite: null, distanceFromSite: 0, siteId: null };
  }

  const full = sites.find((s) => s.id === nearest.site.id) ?? null;
  return {
    nearestSite: full,
    distanceFromSite: nearest.distanceMeters,
    siteId: nearest.site.id,
  };
}
