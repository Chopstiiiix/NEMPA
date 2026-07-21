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

async function saveDeviceToken(userId: string, token: string) {
  const loc = await getCurrentLocation();
  await supabase.from('devices').upsert(
    {
      user_id: userId,
      push_token: token,
      platform: Capacitor.getPlatform(),
      location: loc ? toPointWKT(loc) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'push_token' },
  );
}
