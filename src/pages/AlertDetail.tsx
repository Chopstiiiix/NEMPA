import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AlertMap from '../components/AlertMap';
import type { Alert, GeoPoint } from '../types';

export default function AlertDetail() {
  const { id } = useParams();
  const [alert, setAlert] = useState<Alert | null>(null);

  useEffect(() => {
    (async () => {
      // Read from the alerts_geo view, which exposes the point as numeric lat/lng.
      const { data } = await supabase.from('alerts_geo').select('*').eq('id', id).single();
      setAlert(data);
    })();
  }, [id]);

  if (!alert)
    return (
      <div className="page">
        <div className="card skeleton" style={{ height: 240, marginBottom: 'var(--s4)' }} />
        <div className="card skeleton" style={{ height: 28, width: '70%', marginBottom: 'var(--s3)' }} />
        <div className="card skeleton" style={{ height: 14, width: '40%', marginBottom: 'var(--s4)' }} />
        <div className="card skeleton" style={{ height: 80 }} />
      </div>
    );

  const point: GeoPoint | null =
    alert.last_seen_lat != null && alert.last_seen_lng != null
      ? { lat: alert.last_seen_lat, lng: alert.last_seen_lng }
      : null;

  const typeCls = alert.type === 'robbery' ? 'robbery' : 'missing';
  const typeLabel = alert.type === 'robbery' ? 'Robbery' : 'Missing';
  const live = alert.status === 'verified';

  const badges = (
    <>
      <span className={`badge badge--${typeCls}`}>{typeLabel}</span>
      {live && (
        <span className="badge badge--live">
          <span className="status-dot status-dot--live" /> Live
        </span>
      )}
    </>
  );

  return (
    <div className="page">
      {alert.photo_url ? (
        <div
          style={{
            position: 'relative',
            borderRadius: 'var(--r)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-2)',
            marginBottom: 'var(--s4)',
          }}
        >
          <img
            src={alert.photo_url}
            alt=""
            style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'var(--s3)',
              left: 'var(--s3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {badges}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--s3)' }}>
          {badges}
        </div>
      )}

      <h1 className="page__title">{alert.title}</h1>

      {alert.person_name && (
        <p className="mono" style={{ marginTop: 'var(--s1)' }}>
          {alert.person_name}{alert.person_age ? ` · ${alert.person_age}` : ''}
        </p>
      )}

      <p style={{ margin: 'var(--s4) 0', lineHeight: 1.55, color: 'var(--text)' }}>
        {alert.description}
      </p>

      {alert.last_seen_address && (
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>📍 {alert.last_seen_address}</p>
      )}

      {point && (
        <div className="map-frame" style={{ marginTop: 16 }}>
          <AlertMap point={point} />
        </div>
      )}
      {/* TODO: tips/sightings section — read & insert into alert_tips */}
    </div>
  );
}
