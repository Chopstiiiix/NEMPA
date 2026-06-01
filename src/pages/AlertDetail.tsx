import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AlertMap from '../components/AlertMap';
import { BellIcon, PersonIcon } from '../components/icons';
import { PageLoader } from '../components/Loader';
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

  if (!alert) return <div className="page"><PageLoader /></div>;

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
      <div className={`detail-photo${alert.photo_url ? '' : ' detail-photo--empty'}`}>
        {alert.photo_url ? (
          <img src={alert.photo_url} alt={alert.title} />
        ) : (
          <span className="detail-photo__placeholder">
            {alert.type === 'robbery' ? <BellIcon active={false} size={88} /> : <PersonIcon active={false} size={88} />}
            <span className="mono" style={{ marginTop: 'var(--s3)' }}>No photo provided</span>
          </span>
        )}
        <div className="detail-photo__badges">{badges}</div>
      </div>

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
