import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Hardware volume-button emergency triggers, bridged from the native
 * VolumeButtons plugin (android/ MainActivity key interception, ios/
 * AVAudioSession outputVolume observation):
 *
 *   · volume-DOWN pressed 5× rapidly  → SOS (contacts + live location)
 *   · volume-UP held long (Android) or pressed 5× rapidly (iOS — long
 *     presses aren't observable there)  → DANGER alert (high-priority
 *     platform report + background audio + live location)
 *
 * On web builds there are no hardware keys; Alt+Shift+S / Alt+Shift+D
 * simulate the two triggers for testing in `npm run dev`.
 */

interface VolumePressEvent { direction: 'up' | 'down'; longPress?: boolean }
interface VolumeButtonsPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
  addListener(
    eventName: 'volumePress',
    handler: (e: VolumePressEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const VolumeButtons = registerPlugin<VolumeButtonsPlugin>('VolumeButtons');

const RAPID_COUNT = 5;        // presses…
const RAPID_WINDOW_MS = 4000; // …within this window

export function initVolumeTriggers(onSos: () => void, onDanger: () => void) {
  const downTimes: number[] = [];
  const upTimes: number[] = [];

  const record = (times: number[]) => {
    const now = Date.now();
    times.push(now);
    while (times.length && now - times[0] > RAPID_WINDOW_MS) times.shift();
    if (times.length >= RAPID_COUNT) { times.length = 0; return true; }
    return false;
  };

  // ⚠️ Android only. The iOS path is DISABLED (2026-07-21) after testing on a
  // device: watching AVAudioSession.outputVolume never fired, because the
  // hardware buttons drive the ringer rather than media volume unless audio is
  // playing. Looping a silent track to force the route was tried and still did
  // not work on device, so the plugin is left in place but never enabled —
  // running it would keep silent audio playing forever for a feature that does
  // nothing. On iOS the out-of-app triggers (quick action, Siri, Back Tap,
  // Action Button) and the on-screen SOS button are the emergency paths.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    void VolumeButtons.addListener('volumePress', (e) => {
      if (e.longPress && e.direction === 'up') { onDanger(); return; }
      if (e.direction === 'down' && record(downTimes)) onSos();
      if (e.direction === 'up' && !e.longPress && record(upTimes)) onDanger();
    });
    void VolumeButtons.enable().catch((e) => console.warn('VolumeButtons enable failed', e));
    return;
  }
  if (Capacitor.isNativePlatform()) return; // iOS: nothing to bind

  // web/dev simulation
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey) return;
    if (e.code === 'KeyS') onSos();
    if (e.code === 'KeyD') onDanger();
  });
}
