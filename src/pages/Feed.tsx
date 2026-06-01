import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import AlertCard from '../components/AlertCard';
import type { Alert, AlertType } from '../types';

export default function Feed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<AlertType | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let q = supabase.from('alerts').select('*')
        .in('status', ['verified', 'resolved'])
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('type', filter);
      const { data } = await q;
      setAlerts(data ?? []);
      setLoading(false);
    })();
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
              {f === 'all' ? 'All' : f === 'missing_person' ? 'Missing' : 'Robbery'}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="stagger">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card skeleton" style={{ height: 96, marginBottom: 'var(--s3)' }} />
          ))}
        </div>
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
