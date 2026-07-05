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

export default function Moderation() {
  const { userId, isStaff, loading: roleLoading } = useRole();
  const [pending, setPending] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setPending(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  async function verify(alert: Alert) {
    setBusyId(alert.id);
    setNotice('');
    // 1. Promote to verified (RLS: staff-only update).
    const { error: upErr } = await supabase
      .from('alerts')
      .update({ status: 'verified', verified_by: userId })
      .eq('id', alert.id);
    if (upErr) {
      setBusyId(null);
      setNotice(`Verify failed: ${upErr.message}`);
      return;
    }
    // 2. Fire the radius broadcast. A failure here doesn't un-verify the alert —
    //    surface it so a moderator can retry, but the alert is now public.
    const { data, error: fnErr } = await supabase.functions.invoke('broadcast-alert', {
      body: { alert_id: alert.id },
    });
    setBusyId(null);
    setPending((p) => p.filter((a) => a.id !== alert.id));
    if (fnErr) {
      setNotice(`Verified, but broadcast failed: ${fnErr.message}. You can re-trigger it later.`);
    } else {
      const targeted = (data as { targeted?: number })?.targeted ?? 0;
      const sent = (data as { sent?: number })?.sent ?? 0;
      setNotice(`Verified "${alert.title}" — broadcast to ${sent}/${targeted} nearby devices.`);
    }
  }

  async function reject(alert: Alert) {
    setBusyId(alert.id);
    setNotice('');
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'rejected', verified_by: userId })
      .eq('id', alert.id);
    setBusyId(null);
    if (error) { setNotice(`Reject failed: ${error.message}`); return; }
    setPending((p) => p.filter((a) => a.id !== alert.id));
    setNotice(`Rejected "${alert.title}".`);
  }

  if (roleLoading) return <div className="page"><PageLoader /></div>;

  if (!isStaff) {
    return (
      <div className="page">
        <h1 className="page__title">Moderation</h1>
        <p className="page__sub">Pending reports — verify to broadcast</p>
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
      <p className="page__sub">Pending reports — verify to broadcast</p>

      <SosQueue userId={userId} />

      {notice && <p className="notice">{notice}</p>}

      {loading ? <PageLoader />
        : pending.length === 0 ? (
          <div className="empty">
            <span className="empty__icon">✓</span>
            <p>Nothing awaiting review.</p>
          </div>
        )
        : pending.map((a) => {
          const busy = busyId === a.id;
          const cls = a.type === 'robbery' ? 'robbery' : 'missing';
          return (
            <article key={a.id} className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className={`badge badge--${cls}`}>{typeLabel[a.type] ?? a.type}</span>
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

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => verify(a)} disabled={busy} className="btn btn--live btn--block">
                  {busy ? 'Working…' : 'Verify & Broadcast'}
                </button>
                <button onClick={() => reject(a)} disabled={busy} className="btn btn--danger btn--block">
                  Reject
                </button>
              </div>
            </article>
          );
        })}
    </div>
  );
}
