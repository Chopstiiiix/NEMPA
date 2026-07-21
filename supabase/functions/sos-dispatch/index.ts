// ============================================================
// sos-dispatch — Supabase Edge Function
// Fires a HIGH-PRIORITY FCM push to every moderator/admin device
// the moment a user raises an SOS or danger alert. SOS events are
// deliberately NOT broadcast to the public — the moderation
// guardrail stays intact; responders decide what goes wide.
//
// Request:  POST { sos_id: string }   (verify_jwt: caller must be signed in)
// Response: { ok, targeted, sent, failed, errors }
//
// Deploy:  supabase functions deploy sos-dispatch
// Secrets: reuses FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT (already set)
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

// The app calls this from a WebView, which is a different origin to *.supabase.co,
// so the browser sends a CORS preflight first. Without an OPTIONS handler the
// preflight fell into req.json() (no body), threw, and returned 500 — and a failed
// preflight means the browser never sends the real POST at all. Every SOS page to
// staff died here, silently, because the call site is fire-and-forget.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { sos_id } = await req.json();
    if (!sos_id) return json({ error: 'sos_id required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: bypasses RLS
    );

    // 1. Load the SOS event (geo view → numeric lat/lng).
    const { data: sos, error: sErr } = await supabase
      .from('sos_events_geo').select('*').eq('id', sos_id).single();
    if (sErr || !sos) return json({ error: 'sos event not found' }, 404);
    if (sos.status !== 'active') return json({ error: 'sos not active' }, 409);

    // 2. Who raised it (name/phone make the push actionable).
    const { data: reporter } = await supabase
      .from('profiles').select('full_name, phone').eq('id', sos.user_id).single();

    // 3. Every staff device gets the page.
    const { data: staff, error: pErr } = await supabase
      .from('profiles').select('id').in('role', ['moderator', 'admin']);
    if (pErr) return json({ error: pErr.message }, 500);
    const staffIds = (staff ?? []).map((p: { id: string }) => p.id);
    if (staffIds.length === 0) return json({ ok: true, targeted: 0, sent: 0 });

    const { data: devices, error: dErr } = await supabase
      .from('devices').select('push_token').in('user_id', staffIds);
    if (dErr) return json({ error: dErr.message }, 500);
    if (!devices || devices.length === 0) return json({ ok: true, targeted: 0, sent: 0 });

    // 4. High-priority FCM (heads-up on Android, immediate on iOS).
    const token = await getFcmAccessToken();
    const projectId = Deno.env.get('FCM_PROJECT_ID')!;
    const danger = sos.kind === 'danger';
    const who = reporter?.full_name || 'A Sparrowtell user';
    const where = sos.lat != null && sos.lng != null
      ? ` near ${Number(sos.lat).toFixed(4)}, ${Number(sos.lng).toFixed(4)}`
      : ' (location pending)';
    const title = danger ? '🚨 DANGER — live incident' : '🆘 SOS — user needs help';
    // This push is a "get to your console" page, nothing more. Sparrowtell has no
    // staff UI any more (the review queue was removed on 2026-07-21) — the live
    // trail, audio evidence and the reporter's details are all in Gecko. Do not
    // tell responders to open something this app does not have.
    const body = `${who}${where}. Open Gecko to track live location${danger ? ' and audio evidence' : ''}.`;

    const results = await Promise.allSettled(
      (devices as { push_token: string }[]).map(async (d) => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.push_token,
              notification: { title, body },
              data: { sos_id: sos.id, kind: sos.kind },
              android: { priority: 'HIGH' },
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } },
              },
            },
          }),
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
        return true;
      }),
    );

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
  // CORS headers on every response, not just the preflight — without them the
  // browser discards the body and the caller sees an opaque network failure.
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
