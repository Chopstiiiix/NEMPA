import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRole } from '../lib/useRole';
import { PageLoader } from '../components/Loader';
import SosQueue from '../components/SosQueue';
import type { Alert } from '../types';

const typeLabel: Record<string, string> = {
  missing_person: 'Missing',
  robbery: 'Robbery',
};

interface ReporterDetails { alert_id: string; phone: string | null; nin: string | null }

/**
 * Reports publish instantly — this queue is retroactive moderation:
 * take down false/abusive reports, resolve concluded ones, and see the
 * reporter's private contact details (phone/NIN side table, staff-only).
 * Legacy 'pending' rows can still be verified+broadcast from here.
 */
export default function Moderation() {
  const { userId, isStaff, loading: roleLoading } = useRole();
  const [items, setItems] = useState<Alert[]>([]);
  const [details, setDetails] = useState<Record<string, ReporterDetails>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .in('status', ['pending', 'verified'])
      .order('created_at', { ascending: false })
      .limit(50);
    const alerts = data ?? [];
    setItems(alerts);
    if (alerts.length > 0) {
      const { data: det } = await supabase
        .from('alert_reporter_details')
        .select('alert_id, phone, nin')
        .in('alert_id', alerts.map((a) => a.id));
      setDetails(Object.fromEntries(((det ?? []) as ReporterDetails[]).map((d) => [d.alert_id, d])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  async function setStatus(alert: Alert, status: 'verified' | 'rejected' | 'resolved', label: string) {
    setBusyId(alert.id);
    setNotice('');
    const patch: Record<string, unknown> = { status, verified_by: userId };
    if (status === 'resolved') patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('alerts').update(patch).eq('id', alert.id);
    if (error) {
      setBusyId(null);
      setNotice(`${label} failed: ${error.message}`);
      return;
    }
    // Legacy pending → verified still triggers the radius broadcast.
    if (status === 'verified') {
      const { data, error: fnErr } = await supabase.functions.invoke('broadcast-alert', {
        body: { alert_id: alert.id },
      });
      if (fnErr) setNotice(`Verified, but broadcast failed: ${fnErr.message}.`);
      else {
        const d = data as { targeted?: number; sent?: number };
        setNotice(`Verified "${alert.title}" — broadcast to ${d?.sent ?? 0}/${d?.targeted ?? 0} nearby devices.`);
      }
      setItems((p) => p.map((a) => (a.id === alert.id ? { ...a, status: 'verified' } : a)));
    } else {
      setItems((p) => p.filter((a) => a.id !== alert.id));
      setNotice(`${label} "${alert.title}".`);
    }
    setBusyId(null);
  }

  if (roleLoading) return <div className="page"><PageLoader /></div>;

  if (!isStaff) {
    return (
      <div className="page">
        <h1 className="page__title">Moderation</h1>
        <p className="page__sub">Live reports — take down false alarms fast</p>
        <div className="empty">
          <span className="empty__icon">🔒</span>
          <p>
            This area is for moderators only. {userId ? 'Your account is not a moderator.' : (
              <>Please <Link to="/account" style={{ color: 'var(--signal)' }}>sign in</Link>.</>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Moderation</h1>
      <p className="page__sub">Live reports — take down false alarms fast</p>

      <SosQueue userId={userId} />

      {notice && <p className="notice">{notice}</p>}

      {loading ? <PageLoader />
        : items.length === 0 ? (
          <div className="empty">
            <span className="empty__icon">✓</span>
            <p>No live or pending reports.</p>
          </div>
        )
        : items.map((a) => {
          const busy = busyId === a.id;
          const cls = a.type === 'robbery' ? 'robbery' : 'missing';
          const pending = a.status === 'pending';
          const det = details[a.id];
          return (
            <article key={a.id} className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', gap: 6 }}>
                  <span className={`badge badge--${cls}`}>{typeLabel[a.type] ?? a.type}</span>
                  <span className={`badge badge--${pending ? 'pending' : 'live'}`}>
                    {pending ? 'Pending' : 'Live'}
                  </span>
                </span>
                <span className="mono">{new Date(a.created_at).toLocaleString()}</span>
              </div>

              <h3 style={{ fontSize: 17, margin: '8px 0 4px' }}>
                <Link to={`/alert/${a.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {a.title}
                </Link>
              </h3>
              {a.person_name && (
                <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '2px 0' }}>
                  {a.person_name}{a.person_age ? `, ${a.person_age}` : ''}
                </p>
              )}
              {a.last_seen_address && (
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>📍 {a.last_seen_address}</p>
              )}
              {a.description && (
                <p style={{ fontSize: 14, margin: '8px 0', lineHeight: 1.5 }}>{a.description}</p>
              )}
              {det && (det.phone || det.nin) && (
                <p className="mono" style={{ fontSize: 12, margin: '6px 0', textTransform: 'none' }}>
                  Person (private){det.phone && <> · <a href={`tel:${det.phone}`} style={{ color: 'var(--brand)' }}>{det.phone}</a></>}
                  {det.nin && <> · NIN {det.nin}</>}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {pending ? (
                  <>
                    <button onClick={() => setStatus(a, 'verified', 'Verified')} disabled={busy} className="btn btn--live btn--block">
                      {busy ? 'Working…' : 'Verify & Broadcast'}
                    </button>
                    <button onClick={() => setStatus(a, 'rejected', 'Rejected')} disabled={busy} className="btn btn--danger btn--block">
                      Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setStatus(a, 'resolved', 'Resolved')} disabled={busy} className="btn btn--live btn--block">
                      {busy ? 'Working…' : 'Mark resolved'}
                    </button>
                    <button onClick={() => setStatus(a, 'rejected', 'Took down')} disabled={busy} className="btn btn--danger btn--block">
                      Take down
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
    </div>
  );
}
