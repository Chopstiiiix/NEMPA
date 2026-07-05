export type AlertType = 'missing_person' | 'robbery';
export type AlertStatus = 'pending' | 'verified' | 'resolved' | 'rejected';
export type UserRole = 'citizen' | 'moderator' | 'admin';

export interface GeoPoint { lat: number; lng: number }

export interface Alert {
  id: string;
  type: AlertType;
  status: AlertStatus;
  title: string;
  description: string | null;
  photo_url: string | null;
  last_seen_location: unknown;       // PostGIS geography (raw WKB hex when selected directly)
  last_seen_lat: number | null;      // from the alerts_geo view (st_y)
  last_seen_lng: number | null;      // from the alerts_geo view (st_x)
  last_seen_address: string | null;
  person_name: string | null;
  person_age: number | null;
  person_gender: string | null;
  reporter_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type SosKind = 'sos' | 'danger';
export type SosStatus = 'active' | 'resolved' | 'cancelled';

export interface SosEvent {
  id: string;
  user_id: string;
  kind: SosKind;
  priority: 'high' | 'critical';
  status: SosStatus;
  lat: number | null;               // from the sos_events_geo view
  lng: number | null;
  address: string | null;
  audio_path: string | null;        // storage path in the private sos-evidence bucket
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface SosPing {
  id: number;
  sos_id: string;
  lat: number;                      // from the sos_pings_geo view
  lng: number;
  accuracy_m: number | null;
  created_at: string;
}

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relation: string | null;
  created_at: string;
}

export interface NewAlert {
  type: AlertType;
  title: string;
  description?: string;
  photo_url?: string;
  last_seen_address?: string;
  person_name?: string;
  person_age?: number;
  person_gender?: string;
  location?: GeoPoint;
}
