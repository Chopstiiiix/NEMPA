import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import AlertCard from '../components/AlertCard';
import { PageLoader } from '../components/Loader';
import type { Alert, AlertType } from '../types';

// Module-level cache: coming back to this tab paints the last result
// instantly and refreshes in the background — no loader flash, no
// "hang" while the query round-trips.
const feedCache = new Map<string, Alert[]>();

export default function Feed() {
  const [filter, setFilter] = useState<AlertType | 'all'>('all');
  const [alerts, setAlerts] = useState<Alert[]>(feedCache.get('all') ?? []);
  const [loading, setLoading] = useState(!feedCache.has('all'));

  useEffect(() => {
    const cached = feedCache.get(filter);
    if (cached) { setAlerts(cached); setLoading(false); }
    else setLoading(true);
    let active = true;
    (async () => {
      let q = supabase.from('alerts').select('*')
        .in('status', ['verified', 'resolved'])
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('type', filter);
      const { data } = await q;
      if (!active) return;
      feedCache.set(filter, data ?? []);
      setAlerts(data ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [filter]);

  return (
    <div className="page">
      <h1 className="page__title">Live Alerts</h1>
      <p className="page__sub">Verified community reports near you</p>

      <div
        className="segment"
        role="group"
        aria-label="Filter alerts by type"
        style={{ marginBottom: 'var(--s5)' }}
      >
        {(['all', 'missing_person', 'robbery'] as const).map((f) => {
          const on = filter === f;
          const mod = f === 'missing_person' ? ' is-missing' : f === 'robbery' ? ' is-robbery' : '';
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={on}
              className={`segment__item${on ? ' segment__item--on' + mod : ''}`}
            >
              {on && (
                <motion.span
                  layoutId="filterPill"
                  className="segment__pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="segment__label">
                {f === 'all' ? 'All' : f === 'missing_person' ? 'Missing' : 'Robbery'}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <PageLoader />
      ) : alerts.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">◎</span>
          <p>No active alerts in your area.</p>
        </div>
      ) : (
        <div className="stagger">
          {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      )}
    </div>
  );
}
