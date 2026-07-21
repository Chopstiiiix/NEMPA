-- ============================================================
-- Review + broadcast: ONE audited server path, two front-ends.
--
-- Broadcasting pushes a real person's face and last-seen location to every
-- phone within 25km. That decision therefore gets exactly one implementation
-- (the `review-action` Edge Function), one audit trail, and no way around it.
--
-- Apply once against the live project.
-- ============================================================

-- ------------------------------------------------------------
-- 1. When an alert went public. `verified_by` already existed; without a
--    timestamp the log can't answer "how long did this sit pending?", which
--    is the number that matters for a missing child.
-- ------------------------------------------------------------
alter table alerts add column if not exists verified_at timestamptz;

-- ------------------------------------------------------------
-- 2. The audit log. Append-only by construction: there is no INSERT policy,
--    and the only writer is the Edge Function using the service key (which
--    bypasses RLS). Nothing reachable from a client can forge or erase a row.
-- ------------------------------------------------------------
create table if not exists alert_audit (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  action      text not null check (action in ('broadcast','repush','takedown','resolve')),
  -- Who decided. NULL only when Gecko calls with the service key, in which
  -- case actor_label carries the operator identity Gecko passed.
  actor_id    uuid references auth.users(id) on delete set null,
  actor_label text not null,
  source      text not null check (source in ('sparrow','gecko')),
  targeted    integer,          -- devices inside the radius at decision time
  sent        integer,          -- deliveries FCM accepted
  note        text,             -- takedown/resolve reason, or a push error
  created_at  timestamptz not null default now()
);

create index if not exists alert_audit_alert_idx on alert_audit (alert_id, created_at desc);

alter table alert_audit enable row level security;

drop policy if exists "staff read audit" on alert_audit;
create policy "staff read audit" on alert_audit for select using (is_staff());

revoke insert, update, delete on alert_audit from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Close the direct-PATCH path.
--
-- The "staff moderate alerts" policy proved the caller was staff and nothing
-- more. Any staff client could
--     PATCH /rest/v1/alerts?id=eq.<id>  {"status":"verified"}
-- and flip a report public with no audit row, no verified_by, and no push —
-- an alert that is live to the world and invisible in the log. Grants are
-- revoked rather than the policy dropped, so re-granting is a deliberate
-- one-line act rather than a forgotten default.
--
-- Status now changes ONLY through the review-action Edge Function.
-- Gecko is unaffected: it holds the service key, which bypasses grants.
-- ------------------------------------------------------------
revoke update on alerts from anon, authenticated;

-- ------------------------------------------------------------
-- 4. Reporter PII stays where it was: alert_reporter_details is already
--    reporter+staff only. Explicitly NOT widened here — a broadcast should
--    never be the reason a phone number becomes reachable.
-- ------------------------------------------------------------
