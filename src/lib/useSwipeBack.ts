import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * iOS-style "swipe right from the left edge to go back".
 *
 * The gesture is intentionally edge-anchored: it only arms when the touch
 * starts within EDGE_PX of the left screen edge. That keeps it from fighting
 * vertical scrolling, the Leaflet map's own pan/zoom, and the horizontal
 * `.segment` toggles, all of which live inside the padded content area.
 *
 * No-ops on the feed ('/') since there's nothing to go back to.
 */
const EDGE_PX = 36; // touch must start this close to the left edge to arm
const MIN_DX = 72; // horizontal travel required to count as "back"
const MAX_DY = 48; // vertical drift allowed before we treat it as a scroll
const MAX_MS = 700; // gesture must complete within this window

export function useSwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let armed = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        armed = false;
        return;
      }
      const t = e.touches[0];
      armed = t.clientX <= EDGE_PX;
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = Date.now();
    };

    const onEnd = (e: TouchEvent) => {
      if (!armed) return;
      armed = false;
      if (location.pathname === '/') return; // nothing to go back to from the feed
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = Math.abs(t.clientY - y0);
      if (dx >= MIN_DX && dy <= MAX_DY && Date.now() - t0 <= MAX_MS) {
        navigate(-1);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [navigate, location.pathname]);
}
