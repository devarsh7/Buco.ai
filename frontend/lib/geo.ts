import { UserLocation } from "@/types";

const TORONTO_CENTRE: UserLocation = { lat: 43.6532, lng: -79.3832 };

export function haversineKm(a: UserLocation, b: UserLocation): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Walking estimate at ~4.8 km/h, +20% because streets aren't straight lines. */
export function walkMins(km: number): number {
  return Math.max(1, Math.round(((km * 1.2) / 4.8) * 60));
}

export function distanceLabel(from: UserLocation | null, to: { lat?: number; lng?: number }): string {
  if (!from || to.lat == null || to.lng == null) return "";
  const km = haversineKm(from, { lat: Number(to.lat), lng: Number(to.lng) });
  return `${km.toFixed(1)} km · ~${walkMins(km)} min walk`;
}

export function fallbackLocation(): UserLocation {
  return TORONTO_CENTRE;
}
