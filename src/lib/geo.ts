import { Geolocation } from '@capacitor/geolocation';
import type { GeoPoint } from '../types';

/** Request permission + get current position. Returns null if denied/unavailable. */
export async function getCurrentLocation(): Promise<GeoPoint | null> {
  try {
    const perm = await Geolocation.requestPermissions();
    if (perm.location === 'denied') return null;
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
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
