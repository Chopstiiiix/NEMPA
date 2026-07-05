import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EmergencyContact } from '../types';

/**
 * Manage the contacts who get an SOS text (volume-down ×5 / SOS chip).
 * Rendered on the Account page once signed in.
 */
export default function EmergencyContacts({ userId }: { userId: string }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('emergency_contacts').select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => setContacts(data ?? []));
  }, [userId]);

  async function add() {
    if (!name.trim() || !phone.trim()) { setMsg('Name and phone are required.'); return; }
    setBusy(true); setMsg('');
    const { data, error } = await supabase
      .from('emergency_contacts')
      .insert({ user_id: userId, name: name.trim(), phone: phone.trim(), relation: relation.trim() || null })
      .select()
      .single();
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setContacts((c) => [...c, data as EmergencyContact]);
    setName(''); setPhone(''); setRelation('');
  }

  async function remove(id: string) {
    setContacts((c) => c.filter((x) => x.id !== id));
    await supabase.from('emergency_contacts').delete().eq('id', id);
  }

  return (
    <div className="card" style={{ padding: 'var(--s5)', marginTop: 'var(--s4)' }}>
      <span className="mono" style={{ display: 'block' }}>Emergency contacts</span>
      <p style={{ fontSize: 13.5, color: 'var(--text-dim)', margin: '6px 0 4px' }}>
        Pressing <b>volume down 5×</b> (or the SOS button) texts these people your live
        location and alerts Sparrowtell responders. Add at least one.
      </p>

      {contacts.map((c) => (
        <div key={c.id} className="contact-row">
          <div>
            <div className="contact-row__name">{c.name}</div>
            <div className="contact-row__meta">
              {c.phone}{c.relation ? ` · ${c.relation}` : ''}
            </div>
          </div>
          <button className="contact-row__del" onClick={() => void remove(c.id)} aria-label={`Remove ${c.name}`}>
            ✕
          </button>
        </div>
      ))}
      {contacts.length === 0 && (
        <p className="notice notice--warn" style={{ marginTop: 'var(--s3)' }}>
          No contacts yet — SOS will still alert Sparrowtell responders, but nobody you know gets texted.
        </p>
      )}

      <div className="field">
        <label className="field__label" htmlFor="ec-name">Name</label>
        <input id="ec-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chidinma Okafor" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="ec-phone">Phone</label>
        <input id="ec-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="+234 803 000 0000" />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="ec-rel">Relationship (optional)</label>
        <input id="ec-rel" className="input" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Sister" />
      </div>

      {msg && <p className="notice notice--error" style={{ marginTop: 'var(--s3)' }}>{msg}</p>}

      <button className="btn btn-primary btn--block" style={{ marginTop: 'var(--s4)' }} disabled={busy} onClick={() => void add()}>
        {busy ? 'Saving…' : 'Add contact'}
      </button>
    </div>
  );
}
