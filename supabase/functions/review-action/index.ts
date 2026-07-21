// ============================================================
// review-action — the ONLY path that changes an alert's status.
//
// Two front-ends call this, and they call the same code:
//   • Sparrowtell admin tab — user JWT, staff role checked here
//   • Gecko Intel operator  — service key, operator identity passed in `actor`
//
// It authorises, transitions, and audits. It does NOT talk to FCM: delivery
// stays in `broadcast-alert`, which this invokes. One FCM implementation, one
// status-change implementation, no drift between the two clients.
//
// Deploy: supabase functions deploy review-action
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RADIUS_M = 25_000; // must match broadcast-alert

// An Edge Function without an OPTIONS handler returns 500 to every browser
// preflight, and a failed preflight means the real POST is never sent. That
// bug sat in sos-dispatch undetected for weeks because the client fired it
// fire-and-forget. This one is called from a WebView, so it would break loudly
// — but the cost of getting it wrong is a broadcast that silently doesn't go.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Action = 'preview' | 'broadcast' | 'repush' | 'takedown' | 'resolve';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = body.action as Action;
    const alertId = body.alert_id as string;
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;

    if (!alertId) return json({ error: 'alert_id required' }, 400);
    if (!['preview', 'broadcast', 'repush', 'takedown', 'resolve'].includes(action)) {
      return json({ error: `unknown action: ${action}` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // --- who is asking -------------------------------------------------
    const raw = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    let actorId: string | null = null;
    let actorLabel: string;
    let source: 'sparrow' | 'gecko';

    if (raw && isServiceCredential(raw)) {
      // Gecko, server-to-server. The service key proves the caller is Gecko but
      // says nothing about WHICH human clicked, so Gecko must name them or the
      // audit log degrades to "someone at Gecko did this".
      source = 'gecko';
      actorLabel = String(body.actor ?? '').trim();
      if (!actorLabel) {
        return json({ error: 'actor required when calling with the service key' }, 400);
      }
    } else {
      source = 'sparrow';
      const { data: auth, error: authErr } = await admin.auth.getUser(raw);
      if (authErr || !auth?.user) return json({ error: 'unauthenticated' }, 401);

      // Role is read server-side from profiles. A client claiming staff in its
      // request body would be ignored; column-level grants already stop a user
      // writing their own role.
      const { data: prof } = await admin
        .from('profiles').select('role, full_name').eq('id', auth.user.id).maybeSingle();
      if (!prof || (prof.role !== 'admin' && prof.role !== 'moderator')) {
        return json({ error: 'staff only' }, 403);
      }
      actorId = auth.user.id;
      actorLabel = prof.full_name || auth.user.email || auth.user.id;
    }

    // --- the alert -----------------------------------------------------
    const { data: alert } = await admin
      .from('alerts_geo').select('*').eq('id', alertId).maybeSingle();
    if (!alert) return json({ error: 'alert not found' }, 404);

    // ===================================================================
    // preview — what the confirmation sheet shows. Never mutates.
    // ===================================================================
    if (action === 'preview') {
      const targeted = await countNearby(admin, alert);
      return json({
        ok: true,
        action: 'preview',
        status: alert.status,
        targeted,
        radius_km: RADIUS_M / 1000,
        has_location: alert.last_seen_lat != null && alert.last_seen_lng != null,
      });
    }

    // ===================================================================
    // broadcast — pending → verified, then push.
    // ===================================================================
    if (action === 'broadcast') {
      // Atomic claim. Two operators can tap Broadcast at the same instant —
      // one on a phone, one in Gecko — and only the update whose WHERE still
      // matches 'pending' takes effect. Without the status predicate both
      // would proceed and every phone in range would buzz twice.
      const { data: claimed, error: upErr } = await admin
        .from('alerts')
        .update({
          status: 'verified',
          verified_by: actorId,
          verified_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .eq('status', 'pending')
        .select('id');

      if (upErr) return json({ error: upErr.message }, 500);

      if (!claimed || claimed.length === 0) {
        const { data: fresh } = await admin
          .from('alerts').select('status').eq('id', alertId).maybeSingle();
        if (fresh?.status === 'verified') {
          return json({ ok: true, already: true, message: 'already broadcast' });
        }
        return json({ error: `cannot broadcast an alert with status "${fresh?.status}"` }, 409);
      }

      const push = await deliver(alertId);
      await admin.from('alert_audit').insert({
        alert_id: alertId, action: 'broadcast', actor_id: actorId, actor_label: actorLabel,
        source, targeted: push.targeted, sent: push.sent,
        note: push.error ? `push failed: ${push.error}` : note,
      });

      // The alert IS public now even if FCM refused — deliberately not rolled
      // back, because a live alert nobody was pushed still beats no alert. The
      // caller is told so it can offer a retry rather than showing success.
      return json({
        ok: true, published: true, pushed: !push.error,
        targeted: push.targeted, sent: push.sent, push_error: push.error ?? undefined,
      });
    }

    // ===================================================================
    // repush — retry delivery for an alert that published but failed to send.
    // ===================================================================
    if (action === 'repush') {
      if (alert.status !== 'verified') {
        return json({ error: `repush needs a verified alert (this one is "${alert.status}")` }, 409);
      }
      const push = await deliver(alertId);
      await admin.from('alert_audit').insert({
        alert_id: alertId, action: 'repush', actor_id: actorId, actor_label: actorLabel,
        source, targeted: push.targeted, sent: push.sent,
        note: push.error ? `push failed: ${push.error}` : note,
      });
      return json({
        ok: !push.error, targeted: push.targeted, sent: push.sent,
        push_error: push.error ?? undefined,
      });
    }

    // ===================================================================
    // takedown / resolve — the undo path. Fast, and always logged.
    // ===================================================================
    const target = action === 'takedown' ? 'rejected' : 'resolved';
    // Read BEFORE the update: only an alert that actually went out has anyone
    // to retract to. A pending report that is rejected was never seen by
    // anybody, and pushing "disregard the earlier alert" for something nobody
    // received would be its own small harm.
    const wasPublic = alert.status === 'verified';

    const patch: Record<string, unknown> = { status: target };
    if (action === 'resolve') patch.resolved_at = new Date().toISOString();

    const { data: changed, error: tErr } = await admin
      .from('alerts').update(patch).eq('id', alertId).neq('status', target).select('id');
    if (tErr) return json({ error: tErr.message }, 500);
    if (!changed || changed.length === 0) {
      return json({ ok: true, already: true, message: `already ${target}` });
    }

    await admin.from('alert_audit').insert({
      alert_id: alertId, action, actor_id: actorId, actor_label: actorLabel, source, note,
    });

    // Removing it from the feed is not enough. Someone who saw "MISSING: child,
    // Ikeja" and never sees a retraction keeps acting on it — stopping
    // strangers, calling in sightings — for a report that has been withdrawn.
    // The retraction goes to the recorded recipients, and carries the same
    // collapse id, so it replaces the original notification on their phone.
    let cancel: { targeted: number; sent: number; error?: string } | null = null;
    if (wasPublic) {
      cancel = await deliver(alertId, 'cancel', action === 'resolve' ? 'resolved' : 'withdrawn');
      await admin.from('alert_audit').insert({
        alert_id: alertId, action: 'cancel_push', actor_id: actorId, actor_label: actorLabel,
        source, targeted: cancel.targeted, sent: cancel.sent,
        note: cancel.error ? `cancel push failed: ${cancel.error}` : null,
      });
    }

    return json({
      ok: true,
      status: target,
      retracted: wasPublic,
      cancel_targeted: cancel?.targeted,
      cancel_sent: cancel?.sent,
      cancel_error: cancel?.error ?? undefined,
      note: wasPublic
        ? 'feed updated; retraction sent to everyone who received the alert'
        : 'feed updated; this report was never broadcast, so nothing was sent',
    });
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

/**
 * Is this caller Supabase's service role (i.e. Gecko, server-to-server)?
 *
 * NOT a string comparison against SUPABASE_SERVICE_ROLE_KEY. A project can have
 * several valid service credentials at once — Gecko holds the legacy JWT key
 * while the function's env var now carries the newer format — so equality
 * rejects a perfectly valid caller. That failure mode is silent and total: every
 * Gecko broadcast would 401.
 *
 * ⚠️ This trusts the `role` claim, which is only safe because the Supabase
 * gateway verifies the JWT signature against the project secret BEFORE invoking
 * this function. **This function must stay deployed with verify_jwt ON.**
 * Deploying it with --no-verify-jwt would let anyone forge a service_role claim.
 * The env equality check is kept as a fast path for non-JWT (sb_secret_…) keys.
 */
function isServiceCredential(token: string): boolean {
  if (SERVICE_KEY && token === SERVICE_KEY) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const pad = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
    const claims = JSON.parse(atob(pad.replace(/-/g, '+').replace(/_/g, '/')));
    // Pin the project ref too: a signed token is necessarily ours, but this
    // keeps the intent explicit if the function is ever copied to another project.
    return claims?.role === 'service_role'
      && (!claims.ref || claims.ref === SUPABASE_URL.split('//')[1]?.split('.')[0]);
  } catch {
    return false;
  }
}

/** Devices inside the broadcast radius. Read-only — powers the confirm sheet. */
async function countNearby(
  admin: ReturnType<typeof createClient>,
  alert: Record<string, any>,
): Promise<number> {
  if (alert.last_seen_lat == null || alert.last_seen_lng == null) return 0;
  const { data } = await admin.rpc('devices_near', {
    lat: alert.last_seen_lat, lng: alert.last_seen_lng, radius_m: RADIUS_M,
  });
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Delivery is broadcast-alert's job, not ours. Invoking it rather than
 * re-implementing the FCM v1 send keeps one place where a push is built, so
 * the two clients can never drift into sending different notifications.
 */
async function deliver(
  alertId: string,
  mode: 'alert' | 'cancel' = 'alert',
  reason?: 'withdrawn' | 'resolved',
): Promise<{
  targeted: number; sent: number; error?: string;
}> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/broadcast-alert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: alertId, mode, reason }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) {
      return { targeted: out.targeted ?? 0, sent: out.sent ?? 0, error: out.error ?? `HTTP ${res.status}` };
    }
    return { targeted: out.targeted ?? 0, sent: out.sent ?? 0 };
  } catch (e) {
    return { targeted: 0, sent: 0, error: String(e) };
  }
}
