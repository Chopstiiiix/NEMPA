import { useEffect, type RefObject } from 'react';
import { animate } from 'framer-motion';

/**
 * iOS-style rubber-band overscroll for the page content.
 *
 * The app scrolls the document, and document overscroll is inconsistent across
 * the two WebViews we ship in: iOS bounces, Android WebView mostly doesn't. So
 * we own the gesture at the scroll boundaries instead of asking the platform:
 * drag past the top or bottom and the content follows your finger with falling
 * resistance, then springs back on release.
 *
 * Only the passed element moves. The sticky app bar and the fixed nav dock sit
 * outside it, so they stay planted while the content pulls — which is what the
 * effect is supposed to look like.
 */

const MAX_PULL = 96; // px the content can travel, however hard you pull
const RESISTANCE = 0.45; // lower = stiffer; this is the slope at the start of the pull

export function useOverscrollBounce(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const doc = document.scrollingElement ?? document.documentElement;
    let startY = 0;
    let offset = 0;
    let tracking = false;
    let edge: 0 | 1 | -1 = 0; // which boundary we're pulling against: 1 top, -1 bottom

    const paint = (y: number) => {
      el.style.transform = y === 0 ? '' : `translate3d(0, ${y.toFixed(2)}px, 0)`;
    };

    const onStart = (e: TouchEvent) => {
      // Leaflet owns its own pan/zoom, and a second finger means pinch — stay out of both.
      // The SOS overlay covers the screen while arming; nothing behind it should move.
      if (
        e.touches.length !== 1 ||
        (e.target as Element | null)?.closest?.('.leaflet-container') ||
        document.querySelector('.sos-overlay')
      ) {
        tracking = false;
        return;
      }
      startY = e.touches[0].clientY;
      tracking = true;
      edge = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (e.touches.length !== 1) { release(); return; }
      const dy = e.touches[0].clientY - startY;

      if (edge === 0) {
        const atTop = doc.scrollTop <= 0;
        const atBottom = doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 1;
        if (atTop && dy > 0) edge = 1;
        else if (atBottom && dy < 0) edge = -1;
        else return; // mid-page: leave the scroll entirely alone
        el.style.willChange = 'transform';
      } else if ((edge === 1 && dy <= 0) || (edge === -1 && dy >= 0)) {
        // Finger reversed back through the boundary — hand the gesture back to
        // the native scroller mid-drag instead of holding the page hostage.
        edge = 0;
        offset = 0;
        paint(0);
        el.style.willChange = '';
        startY = e.touches[0].clientY; // rebase so the handoff doesn't jump
        return;
      }

      // Rubber band: asymptotic, so the pull never exceeds MAX_PULL no matter
      // how far the finger travels, and resistance grows the further you go.
      const pull = Math.abs(dy);
      offset = Math.sign(dy) * MAX_PULL * (1 - 1 / ((pull * RESISTANCE) / MAX_PULL + 1));
      paint(offset);
      e.preventDefault(); // we're driving now; don't let the platform fight us
    };

    const release = () => {
      tracking = false;
      if (edge === 0) return;
      edge = 0;
      animate(offset, 0, {
        type: 'spring',
        stiffness: 520,
        damping: 24,
        mass: 0.9,
        onUpdate: paint,
        onComplete: () => { paint(0); el.style.willChange = ''; },
      });
      offset = 0;
    };

    // Backgrounding the app (app switcher, notification) freezes rAF, so a spring
    // started here would never tick and the content would still be sitting at its
    // pulled offset on return. Snap it flat instead of animating.
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      tracking = false;
      edge = 0;
      offset = 0;
      paint(0);
      el.style.willChange = '';
    };

    // touchmove must be non-passive: preventDefault is the whole mechanism.
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', release);
      document.removeEventListener('touchcancel', release);
      document.removeEventListener('visibilitychange', onHide);
      paint(0);
      el.style.willChange = '';
    };
  }, [ref]);
}
