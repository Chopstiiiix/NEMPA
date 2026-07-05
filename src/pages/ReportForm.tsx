import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { getCurrentLocation, toPointWKT } from '../lib/geo';
import { pickPhotoNative, uploadAlertPhoto } from '../lib/photo';
import type { AlertType } from '../types';

export default function ReportForm() {
  const nav = useNavigate();
  const [type, setType] = useState<AlertType>('missing_person');
  const [form, setForm] = useState({
    title: '', description: '', person_name: '', person_age: '', address: '',
    phone: '', nin: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  function attachPhoto(blob: Blob) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(blob);
    setPhotoPreview(URL.createObjectURL(blob));
  }

  async function pickPhoto() {
    if (Capacitor.isNativePlatform()) {
      try {
        const blob = await pickPhotoNative();
        if (blob) attachPhoto(blob);
      } catch (e) {
        console.error('camera error', e);
      }
    } else {
      fileInputRef.current?.click(); // web fallback
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) attachPhoto(file);
    e.target.value = ''; // allow re-picking the same file
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      // getSession() (local, no network) — getUser() can return null in the
      // WKWebView and bounce a signed-in user to /account when filing a report.
      const { data: auth } = await supabase.auth.getSession();
      const user = auth.session?.user ?? null;
      if (!user) { nav('/account'); return; }

      let photoUrl: string | null = null;
      if (photo) {
        try {
          photoUrl = await uploadAlertPhoto(photo, user.id);
        } catch (e) {
          setError(`Photo upload failed: ${(e as Error).message}`);
          return;
        }
      }

      // Best-effort GPS — geo.ts caps the fix wait so this can't hang the form.
      const loc = await getCurrentLocation();

      // Reports publish immediately; moderators take down false ones after the fact.
      const { data: row, error: insErr } = await supabase.from('alerts').insert({
        type,
        status: 'verified',
        title: form.title,
        description: form.description || null,
        photo_url: photoUrl,
        person_name: type === 'missing_person' ? form.person_name || null : null,
        person_age: form.person_age ? Number(form.person_age) : null,
        last_seen_address: form.address || null,
        last_seen_location: loc ? toPointWKT(loc) : null,
        reporter_id: user.id,
      }).select('id').single();
      if (insErr || !row) {
        setError(insErr?.message ?? 'Could not file the report — try again.');
        return;
      }

      // Optional reporter contact details — PII side table (reporter + staff only).
      if (form.phone.trim() || form.nin.trim()) {
        await supabase.from('alert_reporter_details').insert({
          alert_id: row.id,
          phone: form.phone.trim() || null,
          nin: form.nin.trim() || null,
        });
      }

      // Radius push to nearby devices — fire and forget; the alert is already live.
      supabase.functions.invoke('broadcast-alert', { body: { alert_id: row.id } }).catch(() => {});

      clearPhoto();
      nav(`/alert/${row.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">File a Report</h1>
      <p className="page__sub">Goes live to the community instantly</p>

      <div className="segment" role="tablist" aria-label="Report type">
        {(['missing_person', 'robbery'] as const).map((t) => {
          const on = type === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setType(t)}
              className={`segment__item${
                on ? ` segment__item--on ${t === 'missing_person' ? 'is-missing' : 'is-robbery'}` : ''
              }`}
            >
              {on && (
                <motion.span
                  layoutId="reportTypePill"
                  className="segment__pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="segment__label">
                {t === 'missing_person' ? 'Missing Person' : 'Robbery'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rf-title">Title *</label>
        <input id="rf-title" value={form.title} onChange={set('title')} placeholder="Short headline" />
      </div>

      <div className="field">
        <label className="field__label">Photo</label>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
          onChange={onFileChange} style={{ display: 'none' }} />
        {photoPreview ? (
          <div style={{ position: 'relative' }}>
            <img src={photoPreview} alt="Selected" style={{
              width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 'var(--r)',
              border: '1px solid var(--border)', display: 'block',
            }} />
            <button type="button" onClick={clearPhoto} className="btn btn--danger" style={{
              position: 'absolute', top: 8, right: 8, padding: '6px 12px', fontSize: 13,
            }}>Remove</button>
          </div>
        ) : (
          <button type="button" onClick={pickPhoto} className="btn btn--block btn--ghost"
            style={{ borderStyle: 'dashed' }}>📷 Add photo</button>
        )}
      </div>

      {type === 'missing_person' && (
        <>
          <div className="field">
            <label className="field__label" htmlFor="rf-name">Person's name</label>
            <input id="rf-name" value={form.person_name} onChange={set('person_name')} placeholder="Full name" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="rf-age">Age</label>
            <input id="rf-age" value={form.person_age} onChange={set('person_age')} inputMode="numeric" placeholder="e.g. 14" />
          </div>
        </>
      )}

      <div className="field">
        <label className="field__label" htmlFor="rf-address">Last seen / incident address</label>
        <input id="rf-address" value={form.address} onChange={set('address')} placeholder="Area, LGA, State" />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rf-details">Details</label>
        <textarea id="rf-details" value={form.description} onChange={set('description')} rows={4}
          placeholder="Clothing, distinguishing features, what happened…" />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rf-phone">Your phone number (optional)</label>
        <input id="rf-phone" value={form.phone} onChange={set('phone')} type="tel" inputMode="tel"
          placeholder="+234 803 000 0000" />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rf-nin">Your NIN (optional)</label>
        <input id="rf-nin" value={form.nin} onChange={set('nin')} inputMode="numeric"
          placeholder="11-digit National Identification Number" />
        <p style={{ fontSize: 12.5, color: 'var(--text-mute)', marginTop: 6 }}>
          Phone and NIN are only visible to Sparrowtell responders — never shown publicly.
          They help responders reach and verify you faster.
        </p>
      </div>

      {error && <p className="notice notice--error" style={{ marginTop: 'var(--s4)' }}>{error}</p>}

      <p className="mono" style={{ color: 'var(--text-mute)', margin: 'var(--s5) 0', textTransform: 'none', letterSpacing: 'normal' }}>
        Your report is broadcast to the community immediately. False reports are
        taken down by moderators and may lead to a ban.
      </p>

      <button className="btn btn-primary btn--block btn--lg" disabled={!form.title || submitting} onClick={submit}>
        {submitting ? 'Sending…' : 'Send alert now'}
      </button>
    </div>
  );
}
