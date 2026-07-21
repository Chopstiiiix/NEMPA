import { useCallback, useEffect, useState } from 'react';
import {
  checkPerms, requestLocation, requestMicrophone, requestNotifications,
  type EmergencyPerms, type PermState,
} from '../lib/permissions';

/**
 * Explains each emergency permission, then asks for it.
 *
 * The explanation is not decoration. iOS shows each dialog once and treats a
 * refusal as final, so a cold prompt at signup — no context, no reason —
 * converts badly and permanently locks out the users who most need the feature
 * during an incident. Explaining first is both what App Review expects and
 * what actually gets the permission granted.
 */

interface Row {
  key: keyof EmergencyPerms;
  title: string;
  why: string;
  request: () => Promise<PermState>;
}

const ROWS: Row[] = [
  {
    key: 'notifications',
    title: 'Alerts near you',
    why: 'Missing-person and robbery alerts within 25km reach your phone, and you are told when one is withdrawn.',
    request: requestNotifications,
  },
  {
    key: 'location',
    title: 'Your location',
    why: 'Tags where an incident happened, decides which alerts are near enough to matter, and lets responders find you during an SOS.',
    request: requestLocation,
  },
  {
    key: 'microphone',
    title: 'Microphone',
    why: 'During an SOS the app records audio so responders can hear what is happening. Nothing is recorded at any other time.',
    request: requestMicrophone,
  },
];

const LABEL: Record<PermState, string> = {
  granted: 'On',
  denied: 'Blocked',
  prompt: 'Not set',
  unavailable: 'N/A',
};

export default function EmergencySetup({ compact = false }: { compact?: boolean }) {
  const [perms, setPerms] = useState<EmergencyPerms | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => { setPerms(await checkPerms()); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const ask = async (row: Row) => {
    setBusy(row.key);
    const next = await row.request();
    setPerms((p) => (p ? { ...p, [row.key]: next } : p));
    setBusy(null);
  };

  const askAll = async () => {
    // Sequential, never parallel: two native permission dialogs racing each
    // other means the second is dismissed unseen and counted as a refusal.
    for (const row of ROWS) {
      if (perms?.[row.key] === 'prompt') await ask(row);
    }
  };

  if (!perms) return null;

  const outstanding = ROWS.filter((r) => perms[r.key] === 'prompt');
  const blocked = ROWS.filter((r) => perms[r.key] === 'denied');

  // Nothing to do and nothing broken — stay out of the way on the Account page.
  if (compact && outstanding.length === 0 && blocked.length === 0) return null;

  return (
    <div className="card" style={{ padding: 'var(--s5)', marginTop: 'var(--s5)' }}>
      <span className="mono" style={{ display: 'block', marginBottom: 'var(--s2)' }}>
        Emergency setup
      </span>
      <p style={{ marginBottom: 'var(--s4)', color: 'var(--text-dim)', fontSize: 14 }}>
        Granting these now means an emergency is never interrupted by a permission
        prompt. You can change them later in your phone's settings.
      </p>

      {ROWS.map((row) => {
        const state = perms[row.key];
        if (state === 'unavailable') return null;
        return (
          <div key={row.key} className="perm-row">
            <div className="perm-row__text">
              <p className="perm-row__title">{row.title}</p>
              <p className="perm-row__why">{row.why}</p>
            </div>
            {state === 'prompt' ? (
              <button
                className="btn btn--ghost perm-row__btn"
                onClick={() => void ask(row)}
                disabled={busy !== null}
              >
                {busy === row.key ? '…' : 'Allow'}
              </button>
            ) : (
              <span className={`badge ${state === 'granted' ? 'badge--live' : 'badge--pending'}`}>
                {LABEL[state]}
              </span>
            )}
          </div>
        );
      })}

      {outstanding.length > 1 && (
        <button
          className="btn btn-primary btn--block"
          style={{ marginTop: 'var(--s4)' }}
          onClick={() => void askAll()}
          disabled={busy !== null}
        >
          Allow all
        </button>
      )}

      {blocked.length > 0 && (
        <p className="notice notice--warn" style={{ marginTop: 'var(--s4)' }}>
          {blocked.map((b) => b.title).join(' and ')}{' '}
          {blocked.length === 1 ? 'is' : 'are'} blocked. Your phone only asks once —
          turn {blocked.length === 1 ? 'it' : 'them'} back on in Settings › Sparrowtell.
        </p>
      )}
    </div>
  );
}
