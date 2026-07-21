import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { alertTypeMeta } from '../lib/alertTypes';
import { reviewAction, type PreviewResult } from '../lib/review';
import { PageLoader } from '../components/Loader';
import type { Alert } from '../types';

type Queue = 'pending' | 'live';
type Intent = 'broadcast' | 'takedown' | 'resolve';

/**
 * Operator queue. Staff-only, and deliberately narrow: see what was filed,
 * decide, and be able to undo. Investigation proper (map, reporter contact
 * details, SOS trails) lives in Gecko — this exists so a decision isn't
 * blocked on reaching a laptop.
 *
 * Two queues, because an operator needs both halves of the job: reports
 * waiting for a decision, and alerts already out there that may need pulling.
 */
export default function Review() {
  const [queue, setQueue] = useState<Queue>('pending');
  const [rows, setRows] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: Queue) => {
    setLoading(true);
    // is_staff() in the alerts RLS policy is what makes other people's reports
    // visible here at all.
    const { data, error: e } = await supabase
      .from('alerts_geo').select('*')
      .eq('status', which === 'pending' ? 'pending' : 'verified')
      // Pending: oldest first — longest waiting is most urgent.
      // Live: newest first — the thing just sent is the thing you'd pull.
      .order('created_at', { ascending: which === 'pending' });
    if (e) setError(e.message);
    setRows((data as Alert[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(queue); }, [load, queue]);

  // Opening a broadcast sheet asks the server how many phones this would reach.
  // The count is never computed on the client — it must reflect what the sender
  // will actually target, not an estimate that can disagree with it.
  const open = async (alert: Alert, next: Intent) => {
    setSelected(alert); setIntent(next); setPreview(null);
    setError(null); setResult(null);
    if (next === 'broadcast') {
      const r = await reviewAction({ action: 'preview', alert_id: alert.id });
      if (r.error) setError(r.error); else setPreview(r as PreviewResult);
    }
  };

  const close = () => { setSelected(null); setIntent(null); setPreview(null); };

  const commit = async () => {
    if (!selected || !intent) return;
    setWorking(true); setError(null);
    const r = await reviewAction({ action: intent, alert_id: selected.id });
    setWorking(false);

    if (r.error) { setError(r.error); return; }

    if (intent === 'broadcast') {
      setResult(
        r.pushed === false
          ? `Published, but the push failed (${r.push_error}). The alert is live in the feed.`
          : `Broadcast to ${r.sent ?? 0} of ${r.targeted ?? 0} devices.`,
      );
    } else {
      const verb = intent === 'resolve' ? 'Resolved' : 'Taken down';
      if (r.retracted) {
        setResult(
          r.cancel_error
            ? `${verb}, but the retraction failed to send (${r.cancel_error}). Those phones still show the original alert.`
            : `${verb}. Retraction sent to ${r.cancel_sent ?? 0} of ${r.cancel_targeted ?? 0} phones that received it.`,
        );
      } else {
        setResult(`${verb}. This report was never broadcast, so nothing was sent.`);
      }
    }
    setRows((q) => q.filter((a) => a.id !== selected.id));
    close();
  };

  const live = queue === 'live';

  return (
    <div className="page">
      <h1 className="page__title">Review</h1>
      <p className="page__sub">
        {live ? 'Alerts currently out there' : 'Reports awaiting a decision'}
      </p>

      <div className="segment" role="group" aria-label="Queue" style={{ marginBottom: 'var(--s5)' }}>
        {([['pending', 'Waiting'], ['live', 'Live']] as const).map(([v, label]) => {
          const on = queue === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => { setQueue(v); setResult(null); }}
              aria-pressed={on}
              className={`segment__item${on ? ' segment__item--on' : ''}`}
            >
              {on && (
                <motion.span
                  layoutId="reviewPill"
                  className="segment__pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="segment__label">{label}</span>
            </button>
          );
        })}
      </div>

      {error && !selected && <p className="notice notice--error">{error}</p>}
      {result && <p className="notice">{result}</p>}

      {loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">◎</span>
          <p>
            {live
              ? 'No alerts are live right now.'
              : 'Nothing waiting. Filed reports appear here the moment they arrive.'}
          </p>
        </div>
      ) : (
        <div className="stagger">
          {rows.map((a) => {
            const meta = alertTypeMeta(a.type);
            return (
              <article
                key={a.id}
                className={`card review-row${live ? ' review-row--live' : ''}`}
              >
                <div className="review-row__head">
                  <span className={`badge badge--${meta.cls}`}>{meta.short}</span>
                  {live && <span className="badge badge--live">Live</span>}
                  <span className="mono review-row__age">{waiting(a.created_at)}</span>
                </div>
                <h2 className="review-row__title">{a.title}</h2>
                {a.person_name && (
                  <p className="review-row__who">
                    {a.person_name}
                    {a.person_age != null && `, ${a.person_age}`}
                    {a.person_gender && ` · ${a.person_gender}`}
                  </p>
                )}
                {a.description && <p className="review-row__desc">{a.description}</p>}
                <p className="mono review-row__where">
                  {a.last_seen_address || (
                    a.last_seen_lat != null
                      ? `${a.last_seen_lat.toFixed(4)}, ${a.last_seen_lng?.toFixed(4)}`
                      : 'no location given'
                  )}
                </p>
                <div className="review-row__actions">
                  {live ? (
                    <>
                      <button className="btn btn--danger" onClick={() => void open(a, 'takedown')}>
                        Take down
                      </button>
                      <button className="btn btn-primary" onClick={() => void open(a, 'resolve')}>
                        Resolve
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn--ghost" onClick={() => void open(a, 'takedown')}>
                        Reject
                      </button>
                      <button className="btn btn-primary" onClick={() => void open(a, 'broadcast')}>
                        Broadcast…
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selected && intent && (
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              className="sheet"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Confirm"
            >
              <h2 className="sheet__title">{sheetTitle(intent, live)}</h2>
              <p className="sheet__body">{selected.title}</p>
              {selected.person_name && intent === 'broadcast' && (
                <p className="sheet__body">
                  {selected.person_name}
                  {selected.person_age != null && `, ${selected.person_age}`}
                </p>
              )}
              <p className="mono sheet__meta">
                {selected.last_seen_address || 'location from report'}
              </p>

              {intent === 'broadcast' && (
                <p className="sheet__reach mono">
                  {preview === null
                    ? 'counting devices in range…'
                    : preview.has_location === false
                      ? 'This report has no location — nobody can be targeted.'
                      : `~${preview.targeted} device${preview.targeted === 1 ? '' : 's'} within ${preview.radius_km}km`}
                </p>
              )}

              <p className="sheet__warn">{sheetWarning(intent, live)}</p>

              {error && <p className="notice notice--error">{error}</p>}

              <div className="sheet__actions">
                <button className="btn btn--ghost" onClick={close} disabled={working}>
                  Cancel
                </button>
                <button
                  className={`btn ${intent === 'takedown' ? 'btn--danger' : intent === 'broadcast' ? 'btn--live' : 'btn-primary'}`}
                  onClick={() => void commit()}
                  disabled={working || (intent === 'broadcast' && preview?.has_location === false)}
                >
                  {working ? 'Working…' : intent === 'broadcast' ? 'Broadcast' : intent === 'resolve' ? 'Resolve' : live ? 'Take down' : 'Reject'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function sheetTitle(intent: Intent, live: boolean): string {
  if (intent === 'broadcast') return 'Broadcast this alert?';
  if (intent === 'resolve') return 'Mark this resolved?';
  return live ? 'Take this alert down?' : 'Reject this report?';
}

function sheetWarning(intent: Intent, live: boolean): string {
  if (intent === 'broadcast') {
    return "This sends a push notification with this person's details to every phone in that radius. It cannot be un-sent.";
  }
  if (intent === 'resolve') {
    return 'Everyone who received this alert is told it has been resolved, and the notification on their phone is replaced.';
  }
  return live
    ? 'It leaves the feed, and everyone who received it gets a retraction that replaces the original notification on their phone.'
    : 'It leaves the queue and stays invisible to everyone but its reporter. Nothing is pushed — nobody ever saw it.';
}

/** "waiting 4h" reads more usefully in a queue than a timestamp. */
function waiting(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `waiting ${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `waiting ${h}h`;
  return `waiting ${Math.floor(h / 24)}d`;
}
