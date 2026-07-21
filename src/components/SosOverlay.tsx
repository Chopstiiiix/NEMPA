import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  armSos, disarmSos, getSosState, resendContactsSms, setSosHidden,
  stopSos, subscribeSos,
} from '../lib/sos';
import { initVolumeTriggers } from '../lib/volumeTriggers';

/**
 * Mounts once in App. Owns the volume-button triggers and renders the
 * full-screen SOS overlay for both flows:
 *   sos    — vol-down ×5 / SOS chip: contacts + live location
 *   danger — vol-up long-press: silent high-priority report + audio + location
 */
export default function SosOverlay() {
  const s = useSyncExternalStore(subscribeSos, getSosState);

  useEffect(() => {
    initVolumeTriggers(
      () => void armSos('sos'),
      () => void armSos('danger'),
    );
  }, []);

  const danger = s.kind === 'danger';

  return (
    <AnimatePresence>
      {s.error && s.phase === 'idle' && (
        <motion.p
          key="sos-error"
          className="notice notice--error"
          style={{
            position: 'fixed', left: '50%', bottom: 96, zIndex: 90,
            width: 'min(calc(100% - 32px), 430px)', translate: '-50% 0',
          }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          onClick={() => disarmSos()}
        >
          {s.error}
        </motion.p>
      )}

      {/* stealth indicator while a hidden SOS stays live */}
      {s.phase === 'active' && s.hidden && (
        <motion.button
          key="sos-hidden"
          className="sos-chip"
          style={{ position: 'fixed', right: 14, bottom: 96, zIndex: 90 }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setSosHidden(false)}
          aria-label="SOS active — show status"
        >
          <span className="status-dot status-dot--live" /> LIVE
        </motion.button>
      )}

      {s.phase !== 'idle' && !s.hidden && (
        <motion.div
          key="sos-overlay"
          className="sos-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {s.phase === 'arming' ? (
            <>
              <p className="mono">{danger ? 'Danger alert arming' : 'SOS arming'}</p>
              <div className={`sos-ring${danger ? ' sos-ring--danger' : ''}`}>{s.countdown}</div>
              <h2>{danger ? 'Reporting danger' : 'Calling for help'}</h2>
              <p style={{ maxWidth: 300, color: '#C9D8A8' }}>
                {danger
                  ? 'A high-priority report with your live location and background audio goes to Sparrowtell responders.'
                  : 'Your live location goes to Sparrowtell responders and your emergency contacts get a text.'}
              </p>
              <div className="sos-actions">
                <button className="btn btn--lg btn--block" onClick={() => disarmSos()}>
                  Cancel — false alarm
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mono">{danger ? 'Danger alert live' : 'SOS live'}</p>
              <div className={`sos-ring${danger ? ' sos-ring--danger' : ''}`}>
                {danger ? '●' : 'SOS'}
              </div>
              <h2>Help is being signalled</h2>

              <div className="sos-status">
                <span className={`sos-status__row${s.locationOn ? ' sos-status__row--on' : ''}`}>
                  <span className="status-dot" />
                  Live location {s.locationOn ? `sharing (${s.pingCount} pings)` : 'starting…'}
                </span>
                <span className={`sos-status__row${s.dispatched ? ' sos-status__row--on' : ''}`}>
                  <span className="status-dot" />
                  Responders {s.dispatched ? 'notified' : 'being notified…'}
                </span>
                {/* Shown for BOTH kinds — audio is no longer danger-only, and
                    gating this on `danger` meant a failing microphone during a
                    plain SOS was completely invisible to the user. */}
                <span className={`sos-status__row${s.recordingOn ? ' sos-status__row--on' : ''}`}>
                  <span className="status-dot" />
                  {s.recordingOn
                    ? 'Audio recording'
                    : `Audio unavailable${s.recordingError ? ` — ${s.recordingError}` : ''}`}
                </span>
              </div>

              <div className="sos-actions">
                <a className="btn btn--sos btn--lg btn--block" href="tel:112" style={{ textDecoration: 'none' }}>
                  Call 112 — Emergency services
                </a>
                {!danger && (
                  <button className="btn btn--block" onClick={() => void resendContactsSms()}>
                    Text my emergency contacts again
                  </button>
                )}
                {danger && (
                  <button className="btn btn--block" onClick={() => setSosHidden(true)}>
                    Hide this screen (keeps reporting)
                  </button>
                )}
                <button
                  className="btn btn--ghost btn--block"
                  style={{ color: '#C9D8A8', borderColor: 'rgba(233,229,214,0.25)' }}
                  onClick={() => void stopSos('resolved')}
                >
                  I&apos;m safe — stop sharing
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
