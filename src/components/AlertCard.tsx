import { Link } from 'react-router-dom';
import type { Alert } from '../types';

const typeMeta: Record<string, { label: string; cls: string }> = {
  missing_person: { label: 'Missing', cls: 'missing' },
  robbery: { label: 'Robbery', cls: 'robbery' },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AlertCard({ alert }: { alert: Alert }) {
  const meta = typeMeta[alert.type] ?? { label: alert.type, cls: 'missing' };
  const resolved = alert.status === 'resolved';

  return (
    <Link to={`/alert/${alert.id}`} className={`card alert-card alert-card--${meta.cls}`}>
      <div
        className={`alert-card__thumb${alert.photo_url ? '' : ' alert-card__thumb--empty'}`}
        style={alert.photo_url ? { backgroundImage: `url(${alert.photo_url})` } : undefined}
      />
      <div className="alert-card__body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge badge--${meta.cls}`}>{meta.label}</span>
          <span className={`badge ${resolved ? 'badge--resolved' : 'badge--unresolved'}`}>
            {resolved ? 'Resolved' : 'Unresolved'}
          </span>
        </div>
        <h3 className="alert-card__title">{alert.title}</h3>
        <p className="alert-card__meta">
          {alert.last_seen_address ?? 'Location pending'} · {timeAgo(alert.created_at)}
        </p>
      </div>
    </Link>
  );
}
