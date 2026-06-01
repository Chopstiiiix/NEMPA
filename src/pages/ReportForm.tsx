import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { getCurrentLocation, toPointWKT } from '../lib/geo';
import { pickPhotoNative, uploadAlertPhoto } from '../lib/photo';
import type { AlertType } from '../types';

export default function ReportForm() {
  const nav = useNavigate();
  const [type, setType] = useState<AlertType>('missing_person');
  const [form, setForm] = useState({ title: '', description: '', person_name: '', person_age: '', address: '' });
  const [submitting, setSubmitting] = useState(false);
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
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSubmitting(false); nav('/account'); return; }

    let photoUrl: string | null = null;
    if (photo) {
      try {
        photoUrl = await uploadAlertPhoto(photo, auth.user.id);
      } catch (e) {
        setSubmitting(false);
        return alert(`Photo upload failed: ${(e as Error).message}`);
      }
    }

    const loc = await getCurrentLocation();
    const { error } = await supabase.from('alerts').insert({
      type,
      status: 'pending',
      title: form.title,
      description: form.description || null,
      photo_url: photoUrl,
      person_name: type === 'missing_person' ? form.person_name || null : null,
      person_age: form.person_age ? Number(form.person_age) : null,
      last_seen_address: form.address || null,
      last_seen_location: loc ? toPointWKT(loc) : null,
      reporter_id: auth.user.id,
    });
    setSubmitting(false);
    if (error) return alert(error.message);
    clearPhoto();
    nav('/');
  }

  return (
    <div className="page">
      <h1 className="page__title">File a Report</h1>
      <p className="page__sub">Reviewed by a moderator before broadcast</p>

      <div className="segment">
        {(['missing_person', 'robbery'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`segment__item${
              type === t
                ? ` segment__item--on ${t === 'missing_person' ? 'is-missing' : 'is-robbery'}`
                : ''
            }`}
          >
            {t === 'missing_person' ? 'Missing Person' : 'Robbery'}
          </button>
        ))}
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

      <p className="mono" style={{ color: 'var(--text-mute)', margin: 'var(--s5) 0', textTransform: 'none', letterSpacing: 'normal' }}>
        Reports are reviewed by a moderator before being broadcast. False reports may be removed.
      </p>

      <button className="btn btn-primary btn--block btn--lg" disabled={!form.title || submitting} onClick={submit}>
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
    </div>
  );
}
