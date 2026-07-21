import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { SosKind } from '../types';

/**
 * Receives SOS triggers raised from OUTSIDE the app:
 *
 *   · home-screen quick action (long-press the app icon)
 *   · Siri phrase / Back Tap / Action Button, via the App Intents in
 *     ios/App/App/SosIntents.swift
 *
 * The volume-button triggers in `volumeTriggers.ts` only work while the app is
 * open and on screen — the iOS listener is a KVO observation on the audio
 * session, and it stops the moment the app backgrounds. These paths cover the
 * case that actually matters: phone in a pocket, app closed.
 */

interface SosLaunchPlugin {
  consumePending(): Promise<{ kind: string }>;
  addListener(
    eventName: 'sosLaunch',
    handler: () => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const SosLaunch = registerPlugin<SosLaunchPlugin>('SosLaunch');

export function initSosLaunch(onTrigger: (kind: SosKind) => void) {
  if (!Capacitor.isNativePlatform()) return;

  // consumePending() reads AND clears in one native call, so it is the single
  // point of consumption. The `sosLaunch` event deliberately carries no
  // payload — it only nudges a drain. If the event delivered the kind itself,
  // a trigger received while the app was running would fire once from the
  // event and again from the next drain, because nothing would have cleared
  // the stored value.
  const drain = async () => {
    try {
      const { kind } = await SosLaunch.consumePending();
      if (kind === 'sos' || kind === 'danger') onTrigger(kind);
    } catch {
      // A missing plugin (older build) must never break app start-up.
    }
  };

  void drain();
  void SosLaunch.addListener('sosLaunch', () => { void drain(); });

  // A trigger can arrive while the app is suspended, where the WebView is
  // frozen and never sees the event. Draining on resume catches those.
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void drain();
  });
}
