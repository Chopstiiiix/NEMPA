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
  setBackgroundTriggers(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  isBackgroundEnabled(): Promise<{ enabled: boolean; supported: boolean }>;
  addListener(
    eventName: 'sosLaunch',
    handler: () => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const SosLaunch = registerPlugin<SosLaunchPlugin>('SosLaunch');

/**
 * Android only: keep the volume-button gestures alive with the app closed.
 *
 * iOS has no equivalent and cannot have one — a third-party app may not
 * observe hardware buttons while it isn't running. There the Siri phrase, Back
 * Tap, Action Button and quick action fill that gap instead. `supported` is
 * false on iOS so the UI can leave the toggle out rather than offering
 * something that will never work.
 */
export async function backgroundTriggerState(): Promise<{ enabled: boolean; supported: boolean }> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return { enabled: false, supported: false };
  }
  try { return await SosLaunch.isBackgroundEnabled(); }
  catch { return { enabled: false, supported: false }; }
}

export async function setBackgroundTriggers(enabled: boolean): Promise<boolean> {
  try { return (await SosLaunch.setBackgroundTriggers({ enabled })).enabled; }
  catch { return false; }
}

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
