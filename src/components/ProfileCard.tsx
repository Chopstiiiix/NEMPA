import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

/**
 * Who you are, for the people who come when you press SOS.
 *
 * Without this an SOS reaches Gecko as an anonymous "user needs help" pin — a
 * responder gets a location and nothing else. `sos_events_geo` joins these
 * fields on as reporter_name / reporter_phone / reporter_address /
 * reporter_details, so filling it in is what turns a dot on a map into a person.
 *
 * Only these four columns are writable by a user; `role` is not (column-level
 * grant), so nobody can promote themselves to staff through this form.
 */
export default function ProfileCard({ userId }: { userId: string }) {
  const [form, setForm] = useState({ full_name: '', phone: '', address: '', details: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let active = true;
    supabase
      .from('profiles')
      .select('full_name, phone, address, details')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const p = (data ?? {}) as Partial<Profile>;
        setForm({
          full_name: p.full_name ?? '',
          phone: p.phone ?? '',
          address: p.address ?? '',
          details: p.details ?? '',
        });
        setLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setMsg('');
    // update, NOT upsert: upsert compiles to INSERT … ON CONFLICT, which needs an
    // INSERT policy (profiles has none) and writes `id`, which is not in the
    // column-level UPDATE grant — so it fails with 42501 for every user. The row
    // itself is guaranteed by the handle_new_user() signup trigger.
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        details: form.details.trim() || null,
      })
      .eq('id', userId)
      .select('id')
      .maybeSingle();
    setBusy(false);
    if (error) setMsg(`Could not save: ${error.message}`);
    // A matched-nothing update is not an error to PostgREST, so check explicitly
    // rather than telling someone their details are saved when they aren't.
    else if (!data) setMsg('Could not find your profile — sign out and back in, then retry.');
    else setMsg('Saved.');
  }

  const incomplete = !form.full_name.trim() || !form.phone.trim();

  return (
    <div className="card" style={{ padding: 'var(--s5)', marginTop: 'var(--s4)' }}>
      <span className="mono" style={{ display: 'block' }}>Your details</span>
      <p style={{ fontSize: 13.5, color: 'var(--text-dim)', margin: '6px 0 4px' }}>
        Shown to responders when you raise an SOS. Without a name, your alert reaches
        them as an unidentified pin on a map.
      </p>

      {loading ? (
        <div className="skeleton" style={{ height: 120, marginTop: 'var(--s4)' }} />
      ) : (
        <>
          {incomplete && (
            <p className="notice" style={{ margin: 'var(--s3) 0' }}>
              Add at least your name and phone number.
            </p>
          )}

          <div className="field">
            <label className="field__label" htmlFor="pf-name">Full name</label>
            <input id="pf-name" value={form.full_name} onChange={set('full_name')}
              autoComplete="name" placeholder="Your name" />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="pf-phone">Phone number</label>
            <input id="pf-phone" value={form.phone} onChange={set('phone')}
              type="tel" inputMode="tel" autoComplete="tel" placeholder="+234 803 000 0000" />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="pf-address">Home address</label>
            <input id="pf-address" value={form.address} onChange={set('address')}
              placeholder="Area, LGA, State" />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="pf-details">Anything responders should know</label>
            <textarea id="pf-details" value={form.details} onChange={set('details')} rows={3}
              placeholder="What you look like, medical conditions, who to call…" />
          </div>

          {msg && (
            <p className={`notice${msg.startsWith('Could not') ? ' notice--error' : ''}`}
              style={{ marginBottom: 'var(--s3)' }}>{msg}</p>
          )}

          <button className="btn btn-primary btn--block" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </>
      )}
    </div>
  );
}
