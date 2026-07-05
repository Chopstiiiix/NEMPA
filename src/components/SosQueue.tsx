import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SosEvent, SosPing } from '../types';

interface Reporter { id: string; full_name: string | null; phone: string | null }

/**
 * Live SOS board for moderators — realtime view of active panic/danger
 * events with the latest location ping, audio evidence playback and a
 * resolve action. Sits above the normal pending-report queue.
 */
export default function SosQueue({ userId }: { userId: string | null }) {
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [pings, setPings] = useState<Record<string, SosPing>>({});
  const [reporters, setReporters] = useState<Record<string, Reporter>>({});
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const eventsRef = useRef<SosEvent[]>([]);
  eventsRef.current = events;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sos_events_geo')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    const evts = (data ?? []) as SosEvent[];
    setEvents(evts);
    if (evts.length === 0) return;

    const ids = evts.map((e) => e.id);
    const userIds = [...new Set(evts.map((e) => e.user_id))];
    const [pingRes, profRes] = await Promise.all([
      supabase.from('sos_pings_geo').select('*').in('sos_id', ids).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, phone').in('id', userIds),
    ]);
    const latest: Record<string, SosPing> = {};
    for (const p of (pingRes.data ?? []) as SosPing[]) {
      if (!latest[p.sos_id]) latest[p.sos_id] = p; // first seen = newest
    }
    setPings(latest);
    setReporters(Object.fromEntries(((profRes.data ?? []) as Reporter[]).map((r) => [r.id, r])));
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel('sos-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_pings' }, (payload) => {
        const row = payload.new as { sos_id: string };
        // only refetch the geo row for events we're showing
        if (eventsRef.current.some((e) => e.id === row.sos_id)) {
          supabase.from('sos_pings_geo').select('*')
            .eq('sos_id', row.sos_id)
            .order('created_at', { ascending: false }).limit(1).single()
            .then(({ data }) => {
              if (data) setPings((p) => ({ ...p, [row.sos_id]: data as SosPing }));
            });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  async function resolve(ev: SosEvent) {
    setBusyId(ev.id);
    await supabase.from('sos_events')
      .update({ status: 'resolved', resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq('id', ev.id);
    setBusyId(null);
    setEvents((e) => e.filter((x) => x.id !== ev.id));
  }

  async function playAudio(ev: SosEvent) {
    if (!ev.audio_path) return;
    const { data } = await supabase.storage.from('sos-evidence').createSignedUrl(ev.audio_path, 3600);
    if (data?.signedUrl) setAudioUrls((a) => ({ ...a, [ev.id]: data.signedUrl }));
  }

  if (events.length === 0) return null;

  return (
    <section style={{ marginBottom: 'var(--s5)' }}>
      <p className="mono" style={{ marginBottom: 'var(--s3)', color: 'var(--critical)' }}>
        <span className="status-dot status-dot--live" style={{ background: 'var(--critical)' }} />{' '}
        Live SOS — {events.length} active
      </p>

      {events.map((ev) => {
        const ping = pings[ev.id];
        const who = reporters[ev.user_id];
        const lat = ping?.lat ?? ev.lat;
        const lng = ping?.lng ?? ev.lng;
        const danger = ev.kind === 'danger';
        return (
          <article key={ev.id} className={`card sos-card${danger ? ' sos-card--danger' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className={`badge badge--${danger ? 'danger' : 'sos'}`}>
                {danger ? '⚠ Danger — critical' : '🆘 SOS — high'}
              </span>
              <span className="mono">{new Date(ev.created_at).toLocaleTimeString()}</span>
            </div>

            <h3 style={{ fontSize: 17, margin: '10px 0 2px' }}>
              {who?.full_name || 'Unnamed user'}
            </h3>
            {who?.phone && (
              <p style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>
                <a href={`tel:${who.phone}`} style={{ color: 'var(--brand)' }}>{who.phone}</a>
              </p>
            )}

            <p style={{ fontSize: 13.5, color: 'var(--text-dim)', margin: '6px 0' }}>
              {lat != null && lng != null ? (
                <>
                  📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                  {ping && <> · updated {new Date(ping.created_at).toLocaleTimeString()}</>}
                  {' · '}
                  <a
                    href={`https://maps.google.com/?q=${lat},${lng}`}
                    target="_blank" rel="noreferrer"
                    style={{ color: 'var(--brand)' }}
                  >
                    Open map
                  </a>
                </>
              ) : 'No location yet'}
            </p>

            {ev.audio_path && !audioUrls[ev.id] && (
              <button className="btn" style={{ marginTop: 6 }} onClick={() => void playAudio(ev)}>
                ▶ Load audio evidence
              </button>
            )}
            {audioUrls[ev.id] && (
              <audio controls src={audioUrls[ev.id]} style={{ width: '100%', marginTop: 8 }} />
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn--live btn--block"
                disabled={busyId === ev.id}
                onClick={() => void resolve(ev)}
              >
                {busyId === ev.id ? 'Working…' : 'Mark resolved'}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
