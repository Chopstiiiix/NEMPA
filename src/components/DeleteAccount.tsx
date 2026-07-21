import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

/**
 * Permanent account deletion.
 *
 * Required by App Store Review Guideline 5.1.1(v): an app that lets you create
 * an account must let you delete it from inside the app. A support-email link
 * does not satisfy it.
 *
 * Typing DELETE is warranted here in a way it isn't for broadcasting: this is
 * irreversible, there is nobody to undo it for you, and unlike an emergency
 * action nothing is lost by taking three seconds over it.
 */
export default function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setWorking(true); setError(null);
    const { data, error: e } = await supabase.functions.invoke('delete-account');
    if (e || (data as { error?: string })?.error) {
      const ctx = (e as { context?: Response } | null)?.context;
      let msg = e?.message ?? (data as { error?: string })?.error ?? 'Could not delete account';
      if (ctx && typeof ctx.json === 'function') {
        try { const b = await ctx.json(); if (b?.error) msg = String(b.error); } catch { /* keep msg */ }
      }
      setError(msg); setWorking(false);
      return;
    }
    // The user row is gone, so the session's refresh token is dead. Clear it
    // locally too, otherwise the app sits on a stale session until it expires.
    await supabase.auth.signOut();
    location.reload();
  };

  return (
    <div className="card" style={{ padding: 'var(--s5)', marginTop: 'var(--s5)' }}>
      <span className="mono" style={{ display: 'block', marginBottom: 'var(--s2)' }}>
        Danger zone
      </span>
      <p style={{ marginBottom: 'var(--s4)', color: 'var(--text-dim)', fontSize: 14 }}>
        Deleting your account removes your profile, emergency contacts, registered
        devices and any SOS history. Reports you filed that were broadcast stay in
        the public feed, with your name detached.
      </p>
      <button className="btn btn--danger btn--block" onClick={() => { setOpen(true); setConfirm(''); setError(null); }}>
        Delete account
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !working && setOpen(false)}
          >
            <motion.div
              className="sheet"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Confirm account deletion"
            >
              <h2 className="sheet__title">Delete this account?</h2>
              <p className="sheet__body">{email}</p>
              <p className="sheet__warn">
                This cannot be undone. Your profile, contacts, devices and SOS history
                are permanently removed.
              </p>
              <div className="field">
                <label className="field__label" htmlFor="del-confirm">Type DELETE to confirm</label>
                <input
                  id="del-confirm"
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              {error && <p className="notice notice--error">{error}</p>}

              <div className="sheet__actions">
                <button className="btn btn--ghost" onClick={() => setOpen(false)} disabled={working}>
                  Cancel
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => void remove()}
                  disabled={working || confirm.trim().toUpperCase() !== 'DELETE'}
                >
                  {working ? 'Deleting…' : 'Delete for ever'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
