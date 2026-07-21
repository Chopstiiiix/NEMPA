import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { getCurrentLocation, toPointWKT } from './geo';

/**
 * Register for push via Firebase Cloud Messaging, then store the FCM device
 * token + location in Supabase so the broadcast Edge Function can target this
 * device by radius. Call once after the user is authenticated.
 *
 * Uses @capacitor-firebase/messaging so tokens are real FCM registration
 * tokens on BOTH iOS and Android — the edge function's FCM v1 `token` send
 * works unchanged on either platform. No-ops on web.
 */
export async function registerPush(userId: string) {
  if (!Capacitor.isNativePlatform()) return; // push only works on device

  const perm = await FirebaseMessaging.requestPermissions();
  if (perm.receive !== 'granted') return;

  // Initial token, then keep it fresh as FCM rotates it.
  try {
    const { token } = await FirebaseMessaging.getToken();
    if (token) await saveDeviceToken(userId, token);
  } catch (e) {
    console.error('FCM getToken error', e);
  }

  await FirebaseMessaging.addListener('tokenReceived', async (event) => {
    if (event.token) await saveDeviceToken(userId, event.token);
  });

  // Deep-link when a notification is tapped. Alerts open their detail page.
  // SOS pushes are handled in Gecko, not here, so there is nothing to open.
  await FirebaseMessaging.addListener('notificationActionPerformed', (action) => {
    const data = action.notification?.data as Record<string, unknown> | undefined;
    if (typeof data?.alert_id === 'string') window.location.hash = `/alert/${data.alert_id}`;
  });
}

async function saveDeviceToken(_userId: string, token: string) {
  const loc = await getCurrentLocation();
  // RPC, not upsert. push_token is globally unique, so when a second account signs
  // in on a phone another account already registered, the upsert resolved to an
  // UPDATE of someone else's row and RLS refused it — silently, because the error
  // was never read. register_device() hands the token over to the caller instead.
  const { error } = await supabase.rpc('register_device', {
    p_token: token,
    p_platform: Capacitor.getPlatform(),
    p_location: loc ? toPointWKT(loc) : null,
  });
  // Never swallow this again: a device that fails to register cannot be paged for
  // an SOS, and nothing else in the app would ever reveal it.
  if (error) console.error('register_device failed', error.message);
}
