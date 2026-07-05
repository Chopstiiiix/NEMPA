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

  if (Capacitor.isNativePlatform()) {
    void VolumeButtons.addListener('volumePress', (e) => {
      if (e.longPress && e.direction === 'up') { onDanger(); return; }
      if (e.direction === 'down' && record(downTimes)) onSos();
      // iOS can't see long-presses — 5 rapid volume-UPs also raise danger
      if (e.direction === 'up' && !e.longPress && record(upTimes)) onDanger();
    });
    void VolumeButtons.enable().catch((e) => console.warn('VolumeButtons enable failed', e));
    return;
  }

  // web/dev simulation
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey) return;
    if (e.code === 'KeyS') onSos();
    if (e.code === 'KeyD') onDanger();
  });
}
