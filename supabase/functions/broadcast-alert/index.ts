// ============================================================
// broadcast-alert — Supabase Edge Function
// Sends an FCM push to every device within RADIUS_M of an alert.
//
// Trigger options (pick one, see CLAUDE.md):
//  A) Call manually from the moderator UI when verifying an alert
//  B) Database Webhook on alerts UPDATE where status -> 'verified'
//
// Deploy:  supabase functions deploy broadcast-alert
// Secrets: supabase secrets set FCM_PROJECT_ID=... FCM_SERVICE_ACCOUNT='<json>'
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RADIUS_M = 25_000; // 25 km broadcast radius — tune per city density

// Same CORS preflight handling as sos-dispatch. This one has only ever been called
// server-to-server (from Gecko, with the service key), where no preflight happens —
// so the missing OPTIONS handler was invisible here. It would have broken the moment
// anything called it from a browser or WebView.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { alert_id } = await req.json();
    if (!alert_id) return json({ error: 'alert_id required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: bypasses RLS
    );

    // 1. Load the alert from the alerts_geo view (exposes numeric lat/lng,
    //    so we never have to decode WKB hex / GeoJSON here).
    const { data: alert, error: aErr } = await supabase
      .from('alerts_geo').select('*').eq('id', alert_id).single();
    if (aErr || !alert) return json({ error: 'alert not found' }, 404);
    if (alert.status !== 'verified') return json({ error: 'alert not verified' }, 409);

    // 2. Find nearby devices via the PostGIS helper
    if (alert.last_seen_lat == null || alert.last_seen_lng == null) {
      return json({ error: 'alert has no location' }, 422);
    }

    const { data: devices, error: dErr } = await supabase.rpc('devices_near', {
      lat: alert.last_seen_lat, lng: alert.last_seen_lng, radius_m: RADIUS_M,
    });
    if (dErr) return json({ error: dErr.message }, 500);

    // No one in range — nothing to send. Return before minting an FCM token so
    // this succeeds even before Firebase/FCM secrets are configured.
    if (!devices || devices.length === 0) {
      return json({ ok: true, targeted: 0, sent: 0 });
    }

    // 3. Send FCM to each token. getFcmAccessToken throws if the service
    //    account can't mint a token, surfacing credential problems as a 500.
    const token = await getFcmAccessToken();
    const projectId = Deno.env.get('FCM_PROJECT_ID')!;
    // Lookup, not a ternary: alert_type gained 'other' (2026-07-21) and a two-way
    // ternary would push every "other" incident to people's phones as a robbery.
    const TITLES: Record<string, string> = {
      missing_person: '🔍 Missing Person Alert',
      robbery: '🚨 Robbery Alert',
      other: '⚠️ Security Incident',
    };
    const title = TITLES[alert.type as string] ?? '⚠️ Security Incident';

    const results = await Promise.allSettled(
      (devices as { push_token: string }[]).map(async (d) => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.push_token,
              notification: { title, body: alert.title },
              data: { alert_id: alert.id, type: alert.type },
            },
          }),
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
        return true;
      }),
    );

    // Count only deliveries FCM actually accepted; collect a few failures.
    let sent = 0;
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') sent++;
      else if (errors.length < 3) errors.push(String(r.reason).replace('Error: ', ''));
    }
    return json({ ok: true, targeted: devices.length, sent, failed: devices.length - sent, errors });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// --- helpers -------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Exchange the FCM service-account JSON for an OAuth2 access token.
async function getFcmAccessToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };

  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(claim)}`;

  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`FCM auth failed (${res.status}): ${body.error_description || body.error || 'no access_token'}`);
  }
  return body.access_token as string;
}
