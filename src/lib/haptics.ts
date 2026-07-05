import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** Fire a tactile tap. No-ops on web. Never throws (haptics are garnish). */
export function tapHaptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (!Capacitor.isNativePlatform()) return;
  const s = style === 'heavy' ? ImpactStyle.Heavy
    : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  Haptics.impact({ style: s }).catch(() => {});
}

/**
 * One capture-phase listener gives EVERY tappable CTA haptic feedback —
 * buttons, nav tabs, alert cards, segment tabs — without touching each
 * component. Emergency controls (SOS chip / SOS actions) hit harder.
 */
export function initGlobalHaptics() {
  if (!Capacitor.isNativePlatform()) return;
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        'button, [role="button"], a, .nav__item, .alert-card, .segment__item',
      );
      if (!el) return;
      const heavy = el.classList.contains('sos-chip') || el.classList.contains('btn--sos');
      tapHaptic(heavy ? 'heavy' : 'light');
    },
    { capture: true, passive: true },
  );
}
