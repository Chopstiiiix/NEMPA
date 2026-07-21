import { Link } from 'react-router-dom';
import { alertTypeMeta } from '../lib/alertTypes';
import type { Alert } from '../types';

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AlertCard({ alert }: { alert: Alert }) {
  const meta = alertTypeMeta(alert.type);
  const resolved = alert.status === 'resolved';
  // Only ever your own report (RLS) — it is with responders but not yet public.
  const pending = alert.status === 'pending';

  return (
    <Link to={`/alert/${alert.id}`} className={`card alert-card alert-card--${meta.cls}`}>
      <div
        className={`alert-card__thumb${alert.photo_url ? '' : ' alert-card__thumb--empty'}`}
        style={alert.photo_url ? { backgroundImage: `url(${alert.photo_url})` } : undefined}
      />
      <div className="alert-card__body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge badge--${meta.cls}`}>{meta.short}</span>
          {pending ? (
            <span className="badge badge--pending">With responders</span>
          ) : (
            <span className={`badge ${resolved ? 'badge--resolved' : 'badge--unresolved'}`}>
              {resolved ? 'Resolved' : 'Unresolved'}
            </span>
          )}
        </div>
        <h3 className="alert-card__title">{alert.title}</h3>
        <p className="alert-card__meta">
          {alert.last_seen_address ?? 'Location pending'} · {timeAgo(alert.created_at)}
        </p>
      </div>
    </Link>
  );
}
