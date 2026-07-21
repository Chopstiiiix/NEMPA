import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

/**
 * Emergency permissions, requested up-front instead of mid-incident.
 *
 * Before this existed the microphone prompt first appeared inside
 * `recorder.start()` — which only runs once a danger alert has fired. The very
 * first time a user saw that dialog was during an emergency, with the app
 * waiting on them to read it. Location had the same shape, appearing partway
 * through filing a report or raising an SOS.
 *
 * ⚠️ iOS shows each of these dialogs EXACTLY ONCE. A "Don't Allow" is
 * permanent as far as the app is concerned — only a trip to Settings undoes
 * it. So these are never fired cold: `EmergencySetup` explains what each one
 * is for first. That is also what keeps this the right side of App Store
 * Review Guideline 5.1.1, which rejects permission requests that aren't tied
 * to a feature the user is actively setting up.
 */

export type PermState = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface EmergencyPerms {
  notifications: PermState;
  location: PermState;
  microphone: PermState;
}

// The mic has no reliable query API in a WKWebView — navigator.permissions
// doesn't implement 'microphone' on iOS — so a successful grant is remembered
// here. Only ever written after getUserMedia actually resolved.
const MIC_KEY = 'sparrowtell.mic.granted';

function norm(s: string | undefined): PermState {
  if (s === 'granted') return 'granted';
  if (s === 'denied') return 'denied';
  return 'prompt';
}

export async function checkPerms(): Promise<EmergencyPerms> {
  const native = Capacitor.isNativePlatform();

  let notifications: PermState = 'unavailable';
  let location: PermState = 'unavailable';

  if (native) {
    try { notifications = norm((await FirebaseMessaging.checkPermissions()).receive); }
    catch { notifications = 'prompt'; }
  }
  try { location = norm((await Geolocation.checkPermissions()).location); }
  catch { location = native ? 'prompt' : 'unavailable'; }

  let microphone: PermState = 'prompt';
  if (localStorage.getItem(MIC_KEY) === '1') microphone = 'granted';
  else if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    microphone = 'unavailable';
  }

  return { notifications, location, microphone };
}

export async function requestNotifications(): Promise<PermState> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  try { return norm((await FirebaseMessaging.requestPermissions()).receive); }
  catch { return 'denied'; }
}

export async function requestLocation(): Promise<PermState> {
  try { return norm((await Geolocation.requestPermissions()).location); }
  catch { return 'denied'; }
}

/**
 * Opens the mic just long enough for the OS to record the grant, then releases
 * it immediately. Holding the stream would light the recording indicator and
 * keep the mic warm for no reason — on a safety app that is exactly the kind
 * of thing that makes people uninstall.
 */
export async function requestMicrophone(): Promise<PermState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    localStorage.setItem(MIC_KEY, '1');
    return 'granted';
  } catch {
    return 'denied';
  }
}
