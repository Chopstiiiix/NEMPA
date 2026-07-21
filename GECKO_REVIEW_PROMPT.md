# Prompt for the Gecko Intel session

Paste everything below the line into your `~/gecko_intel` Claude session.

---

I need to build the operator review + broadcast surface for Sparrowtell inside Gecko.

## Context: what already exists, and what changed today

Sparrowtell (the citizen app, `~/NEMPA`) shares the Supabase project
`ticnoeumdvticwtuaujd`. A citizen files a report and it lands as `status='pending'` —
invisible to everyone except its own reporter. Someone has to decide whether it gets
broadcast as a push notification to every phone within 25km. **Right now nothing in
Gecko can make that decision, so no report filed in the app can ever reach anyone.**
Closing that is the point of this work.

As of today there is exactly **one** server-side path that may change an alert's status:
the `review-action` Edge Function. It authorises the caller, transitions the row, writes
an audit record, and invokes `broadcast-alert` for delivery. The Sparrowtell app already
calls it from a staff-only Review tab. Gecko must call the *same* function so the two
surfaces cannot drift.

Direct `UPDATE` on `alerts` has been revoked from `anon` and `authenticated` in Postgres
to enforce this. **Gecko holds the `service_role` key, which bypasses RLS and grants — so
for Gecko this is a discipline, not a fence.** Do not `PATCH /rest/v1/alerts` to set a
status anywhere in this codebase. Doing so produces an alert that is live to the public
with no audit row, no `verified_by`, and no push — visible to users, invisible in the log.

## What's in the repo now

`src/app/api/sparrow/route.ts` is a single `GET`. It merges active SOS events (service key,
RLS-protected) with community alerts, and feeds the world map. Two problems:

1. It queries `alerts_geo?status=eq.verified`, so **pending reports never appear** — the
   queue you need to review is invisible.
2. There is no write path of any kind.

## Task

### 1. Surface pending reports

Change the alerts query to `status=in.(pending,verified)`. Pending rows require the
service key (RLS hides them from anon). Tag them distinctly in the returned items —
they are **not** public alerts and must never render on the public map layer the same
way a verified one does. A pending report is an unverified claim about a named person.

### 2. Add the write path

New route (e.g. `src/app/api/sparrow/review/route.ts`), server-side only, POST. It
proxies to the Edge Function — it must not contain any status logic of its own:

```
POST https://ticnoeumdvticwtuaujd.supabase.co/functions/v1/review-action
Authorization: Bearer <SPARROW_SUPABASE_SERVICE_KEY>
Content-Type: application/json

{ "action": "preview" | "broadcast" | "repush" | "takedown" | "resolve",
  "alert_id": "<uuid>",
  "actor":    "<who is clicking — REQUIRED for service-key calls>",
  "note":     "<optional reason, stored in the audit log>" }
```

`actor` is mandatory and the function 400s without it. The service key proves the call
came from Gecko but says nothing about which human decided; without `actor` the audit
log degrades to "someone at Gecko did this". Pass a real operator identity.

Responses:

| action | returns |
|---|---|
| `preview` | `{ok, status, targeted, radius_km, has_location}` — read-only, mutates nothing |
| `broadcast` | `{ok, published, pushed, targeted, sent, push_error?}` |
| `broadcast` (already live) | `{ok, already: true}` — idempotent, does not re-push |
| `repush` | `{ok, targeted, sent, push_error?}` — retry after a failed delivery |
| `takedown` / `resolve` | `{ok, status, retracted, cancel_targeted, cancel_sent, cancel_error?}` |

Errors come back as `{error: "..."}` with a 4xx/5xx. Surface the real message to the
operator — during an emergency a generic failure string is useless.

### 3. The operator UI

On the screen where you already investigate a report, add:

- **Broadcast** — must open a confirmation step first. Call `preview` and show the
  actual `targeted` device count and radius from the response. Do not compute or
  estimate this client-side; it has to match what the sender will really target.
  State plainly that this pushes the person's details to every phone in that radius
  and cannot be un-sent. Disable the button when `has_location` is false — with no
  location there is nobody to target.
- **Takedown** — fast, one step, always available on a live alert. It removes the alert
  from the feed *and* sends a retraction push to exactly the phones that received the
  original, replacing that notification in their tray. The response tells you what
  happened: `{retracted, cancel_targeted, cancel_sent, cancel_error?}`. Show those
  numbers. If `retracted` is false the alert had never been broadcast, so nothing was
  sent — say that rather than claiming a retraction went out.
- **Resolve** — for alerts whose situation has ended.
- Show `{sent}/{targeted}` after a broadcast. If `pushed` is false the alert published
  but delivery failed — say so and offer `repush`, don't render it as success.

### 4. Audit visibility

There's a new `alert_audit` table: `alert_id, action, actor_id, actor_label, source
('sparrow'|'gecko'), targeted, sent, note, created_at`. It's append-only — staff can
SELECT, nothing can INSERT/UPDATE/DELETE through PostgREST. Show the history on the
alert detail view so an operator can see who broadcast what, when, and to how many.

### 5. Live-listen audio on SOS events

SOS and danger alerts now stream audio in near-real-time. Build a player on the SOS detail
view so an operator can hear what is happening while it happens.

- Table `sos_audio_segments (id, sos_id, seq, path, created_at)`. Poll or subscribe by
  `sos_id`, ordered by `seq`.
- Each `path` is an object in the **private** `sos-evidence` bucket. Sign a URL server-side
  with the service key (`/storage/v1/object/sign/sos-evidence/<path>`); never expose the
  bucket or the key to the browser.
- **Each segment is a complete, standalone audio file** (~8s). Play them in `seq` order.
  Do NOT try to concatenate the raw bytes and decode the result — they are separate
  containers, not fragments of one stream. Queue them into an `<audio>` element, or push
  each through a Web Audio buffer source, one after another.
- Expect gaps. Segments upload fire-and-forget, so a failed one is dropped rather than
  retried — a missing `seq` means that slice never arrived, not that it is still coming.
  Show the gap rather than stalling playback waiting for it.
- Latency is roughly 8–16s behind live (segment length plus upload). Label it honestly in
  the UI — an operator making decisions needs to know they are hearing the recent past, not
  the present.
- `sos_events.audio_path` now holds the segment *folder*, not a single file. If you use it
  for anything beyond a truthiness check, update that.

## Constraints

- Never write `alerts.status` directly. Every transition goes through `review-action`.
- The service key must stay server-side. It bypasses all RLS — it must never reach a
  browser bundle or a client component.
- Reporter PII (`alert_reporter_details`: phone, NIN) is reporter+staff only. It may be
  shown to an operator investigating; it must never end up in a broadcast payload or
  any public response.
- Pending ≠ verified. Keep them visually unmistakable everywhere they appear.

## How to verify

Read-only check that the wiring works, safe to run — it sends nothing:

```bash
curl -s -X POST https://ticnoeumdvticwtuaujd.supabase.co/functions/v1/review-action \
  -H "Authorization: Bearer $SPARROW_SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"preview","alert_id":"<uuid>","actor":"you@gecko"}'
```

Expect `{"ok":true,"action":"preview","status":"...","targeted":N,"radius_km":25,...}`.

A real broadcast test sends actual push notifications to real phones. File a throwaway
report from the Sparrowtell app first and broadcast that one — don't test on a real
person's report.
