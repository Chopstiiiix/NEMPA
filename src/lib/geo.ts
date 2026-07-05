import { Geolocation } from '@capacitor/geolocation';
import type { GeoPoint } from '../types';

/** Never let a GPS fix block the UI longer than this. */
const FIX_TIMEOUT_MS = 8000;

/**
 * Request permission + get current position. Returns null if denied,
 * unavailable, or slower than FIX_TIMEOUT_MS — callers must treat
 * location as best-effort and proceed without it (a report stuck on
 * "Submitting…" because GPS can't get a fix indoors is worse than a
 * report with no pin).
 */
export async function getCurrentLocation(): Promise<GeoPoint | null> {
  try {
    const perm = await Geolocation.requestPermissions();
    if (perm.location === 'denied') return null;
    const pos = await Promise.race([
      Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: FIX_TIMEOUT_MS,          // plugin-level cap
        maximumAge: 60_000,               // a fix from the last minute is fine
      }),
      // belt-and-braces: some platforms ignore the plugin timeout
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS + 2000)),
    ]);
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (e) {
    console.error('geo error', e);
    return null;
  }
}

/** Build the WKT string Supabase/PostGIS accepts for a geography(point). */
export function toPointWKT(p: GeoPoint): string {
  return `SRID=4326;POINT(${p.lng} ${p.lat})`;
}
