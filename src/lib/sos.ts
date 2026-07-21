import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { getCurrentLocation, toPointWKT } from './geo';
import { EvidenceRecorder } from './recorder';
import type { EmergencyContact, GeoPoint, SosKind } from '../types';

/**
 * SOS engine — a tiny external store (useSyncExternalStore-friendly)
 * driving the whole emergency flow:
 *
 *   arm(kind)  →  5s cancellable countdown  →  fire()
 *     · insert sos_events row (status=active)
 *     · invoke sos-dispatch edge fn → high-priority FCM to moderators
 *     · watchPosition → sos_pings live trail (realtime → mods + Gecko Intel)
 *     · BOTH kinds: segmented audio via MediaRecorder — one standalone,
 *       playable ~8s file at a time into the private sos-evidence bucket,
 *       indexed in sos_audio_segments so Gecko can listen along near-live
 *     · kind='sos': open the SMS composer pre-filled with a live map link
 *       to every saved emergency contact
 *   stop('cancelled' | 'resolved') winds everything down.
 */

export type SosPhase = 'idle' | 'arming' | 'active';

export interface SosState {
  phase: SosPhase;
  kind: SosKind;
  countdown: number;          // seconds left while arming
  sosId: string | null;
  hidden: boolean;            // overlay dismissed but SOS still live (stealth)
  locationOn: boolean;
  recordingOn: boolean;
  recordingError: string | null;  // why audio is not running, shown in the overlay
  dispatched: boolean;        // moderators notified
  pingCount: number;
  error: string | null;
  lastPoint: GeoPoint | null;
}

const initial: SosState = {
  phase: 'idle', kind: 'sos', countdown: 0, sosId: null, hidden: false,
  locationOn: false, recordingOn: false, recordingError: null, dispatched: false,
  pingCount: 0, error: null, lastPoint: null,
};

let state: SosState = { ...initial };
const listeners = new Set<() => void>();

function set(patch: Partial<SosState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeSos(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function getSosState() { return state; }

let armTimer: ReturnType<typeof setInterval> | null = null;
let watchId: string | null = null;
let lastPingAt = 0;
const recorder = new EvidenceRecorder();

/** Begin the cancellable countdown. No-op if an SOS is already live. */
export async function armSos(kind: SosKind, seconds = 5) {
  if (state.phase !== 'idle') return;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    set({ error: 'Sign in first — SOS needs an account so responders know who to help.' });
    return;
  }
  set({ ...initial, phase: 'arming', kind, countdown: seconds, error: null });
  armTimer = setInterval(() => {
    if (state.countdown <= 1) {
      clearInterval(armTimer!); armTimer = null;
      void fire();
    } else {
      set({ countdown: state.countdown - 1 });
    }
  }, 1000);
}

/** Cancel during countdown (nothing has been sent yet). */
export function disarmSos() {
  if (armTimer) { clearInterval(armTimer); armTimer = null; }
  if (state.phase === 'arming') set({ ...initial });
}

/** Hide/show the overlay while the SOS stays live (stealth for danger mode). */
export function setSosHidden(hidden: boolean) {
  if (state.phase === 'active') set({ hidden });
}

async function fire() {
  const { data: auth } = await supabase.auth.getSession();
  const user = auth.session?.user;
  if (!user) { set({ ...initial, error: 'Session expired — sign in and retry.' }); return; }

  set({ phase: 'active', countdown: 0 });

  const point = await getCurrentLocation();
  const { data: row, error } = await supabase
    .from('sos_events')
    .insert({
      user_id: user.id,
      kind: state.kind,
      priority: state.kind === 'danger' ? 'critical' : 'high',
      status: 'active',
      location: point ? toPointWKT(point) : null,
    })
    .select('id')
    .single();

  if (error || !row) {
    set({ ...initial, error: `Could not raise SOS: ${error?.message ?? 'unknown error'}` });
    return;
  }
  set({ sosId: row.id, lastPoint: point });

  // High-priority push to platform moderators (failure is non-fatal —
  // the row itself already appears in the moderation queue via realtime).
  supabase.functions.invoke('sos-dispatch', { body: { sos_id: row.id } })
    .then(({ error: fnErr }) => { if (!fnErr) set({ dispatched: true }); })
    .catch(() => {});

  startLocationTrail(row.id, point);

  // Audio runs for BOTH kinds now (2026-07-21). It used to be danger-only,
  // which meant a panic SOS — the flow people actually reach for — sent
  // responders a location and nothing they could hear. The permission is
  // primed during onboarding (EmergencySetup), so this no longer puts a
  // microphone dialog in front of someone mid-emergency.
  const ok = await recorder.start((blob, seq, ext) => {
    void uploadSegment(user.id, row.id, blob, seq, ext);
  });
  set({ recordingOn: ok, recordingError: ok ? null : recorder.lastError });

  if (state.kind !== 'danger') {
    // Panic SOS: hand the user a pre-filled SMS to their emergency contacts.
    void openContactsSms(point);
  }
}

/** End the SOS. 'cancelled' = false alarm, 'resolved' = I'm safe now. */
export async function stopSos(status: 'cancelled' | 'resolved' = 'resolved') {
  if (armTimer) { clearInterval(armTimer); armTimer = null; }
  if (watchId) { try { await Geolocation.clearWatch({ id: watchId }); } catch { /* noop */ } watchId = null; }

  const sosId = state.sosId;

  // Flushes the final partial segment through the same handler, so the last
  // few seconds before the user marked themselves safe are not lost.
  await recorder.stop();

  if (sosId) {
    await supabase.from('sos_events')
      .update({ status, resolved_at: new Date().toISOString() })
      .eq('id', sosId);
  }
  set({ ...initial });
}

// --- live location trail --------------------------------------

function startLocationTrail(sosId: string, first: GeoPoint | null) {
  if (first) void insertPing(sosId, first, null);
  Geolocation.watchPosition(
    { enableHighAccuracy: true, timeout: 30_000 },
    (pos) => {
      if (!pos) return;
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      // throttle: at most one ping every 10s
      if (Date.now() - lastPingAt < 10_000) { set({ lastPoint: p }); return; }
      lastPingAt = Date.now();
      void insertPing(sosId, p, pos.coords.accuracy ?? null);
    },
  ).then((id) => {
    watchId = id;
    set({ locationOn: true });
  }).catch((e) => {
    console.error('watchPosition failed', e);
    set({ locationOn: false });
  });
}

async function insertPing(sosId: string, p: GeoPoint, accuracy: number | null) {
  const { error } = await supabase.from('sos_pings').insert({
    sos_id: sosId,
    location: toPointWKT(p),
    accuracy_m: accuracy,
  });
  if (!error) set({ pingCount: state.pingCount + 1, lastPoint: p });
}

// --- audio evidence -------------------------------------------

/**
 * Upload one finished segment and index it so Gecko can play along.
 *
 * Deliberately fire-and-forget per segment: a segment that fails to upload is
 * dropped rather than retried. Retrying would queue audio behind a bad
 * connection and deliver it minutes late, when what an operator needs is the
 * most recent sound in the room. A gap in the trail is more useful than a
 * backlog pretending to be live.
 */
async function uploadSegment(
  userId: string, sosId: string, blob: Blob, seq: number, ext: string,
) {
  if (blob.size === 0) return;
  // Zero-padded so a plain lexical sort of the bucket is also chronological.
  const path = `${userId}/${sosId}/seg-${String(seq).padStart(4, '0')}.${ext}`;
  const { error } = await supabase.storage
    .from('sos-evidence')
    .upload(path, blob, { upsert: true, contentType: blob.type || 'audio/webm' });
  if (error) { console.error('segment upload failed', error.message); return; }

  await supabase.from('sos_audio_segments').insert({ sos_id: sosId, seq, path });

  // audio_path now points at the segment FOLDER, not a single file. Gecko only
  // tests it for truthiness to show an audio indicator, so that keeps working;
  // written once on the first segment rather than on every one.
  if (seq === 1) {
    await supabase.from('sos_events')
      .update({ audio_path: `${userId}/${sosId}` }).eq('id', sosId);
  }
}

// --- emergency contacts ---------------------------------------

export async function listContacts(): Promise<EmergencyContact[]> {
  const { data } = await supabase
    .from('emergency_contacts')
    .select('*')
    .order('created_at', { ascending: true });
  return data ?? [];
}

export function mapsLink(p: GeoPoint | null): string {
  return p ? `https://maps.google.com/?q=${p.lat},${p.lng}` : '';
}

/**
 * Open the SMS composer pre-filled for every saved contact. A silent
 * server-side SMS needs a provider (Twilio/Termii) — until that's wired,
 * one tap in the composer is the reliable path on both platforms.
 */
export async function openContactsSms(point: GeoPoint | null) {
  const contacts = await listContacts();  // RLS scopes to the signed-in user
  if (contacts.length === 0) return;
  const numbers = contacts.map((c) => c.phone.replace(/\s+/g, '')).join(',');
  const body = encodeURIComponent(
    `EMERGENCY — I need help. This is an automatic Sparrowtell SOS.` +
    (point ? ` My live location: ${mapsLink(point)}` : ' Location unavailable.'),
  );
  // iOS wants `&body=`, Android wants `?body=`
  const sep = Capacitor.getPlatform() === 'ios' ? '&' : '?';
  window.location.href = `sms:${numbers}${sep}body=${body}`;
}

/** Re-open the composer from the overlay (e.g. after dismissing it once). */
export async function resendContactsSms() {
  await openContactsSms(state.lastPoint);
}
