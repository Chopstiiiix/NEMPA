// ============================================================
// delete-account — permanent account deletion, initiated by the account owner.
//
// App Store Review Guideline 5.1.1(v): an app that lets you create an account
// must let you delete it from inside the app. A "email us to delete" link does
// not satisfy it. This is a submission blocker, not a nicety.
//
// Deletes the auth user; Postgres FKs cascade profiles, devices,
// emergency_contacts and sos_events (+ pings). alerts.reporter_id and
// alert_audit.actor_id are ON DELETE SET NULL by design — a broadcast alert
// must not disappear from the public feed because its reporter left, and an
// audit trail must not lose its rows.
//
// Deploy: supabase functions deploy delete-account
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Identity comes from the JWT only. There is deliberately no user_id
    // parameter — a body-supplied id would let any signed-in caller delete
    // anyone else's account.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) return json({ error: 'unauthenticated' }, 401);
    const userId = auth.user.id;

    // Storage has no FK to auth.users, so nothing cascades. Both buckets are
    // laid out as <userId>/<file>, so the whole prefix goes.
    const removed: Record<string, number> = {};
    for (const bucket of ['alert-photos', 'sos-evidence']) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
        const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
        if (paths.length > 0) {
          await admin.storage.from(bucket).remove(paths);
        }
        removed[bucket] = paths.length;
      } catch {
        // A storage failure must not strand a half-deleted account. Press on:
        // the auth user is the thing the user asked to be rid of, and orphaned
        // objects in a private bucket are recoverable housekeeping.
        removed[bucket] = -1;
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true, deleted: userId, storage: removed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
