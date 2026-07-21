-- ============================================================
-- Cancellation pushes: tell the people who were actually told.
--
-- Taking an alert down removed it from the feed but left the notification
-- sitting on every phone that received it. Someone who saw "MISSING: child,
-- Ikeja" and never sees a retraction keeps acting on it — stopping strangers,
-- calling in sightings — for a report that was withdrawn.
--
-- Re-running devices_near at takedown time would be the easy way and the wrong
-- one: phones move. It would miss someone who got the alert and drove home, and
-- would notify someone who arrived afterwards about an alert they never saw.
-- So record who was actually delivered to, and cancel to exactly that set.
-- ============================================================

create table if not exists alert_recipients (
  alert_id   uuid not null references alerts(id) on delete cascade,
  -- device_id, not the token: tokens rotate, and joining to devices at send
  -- time picks up the current one. Also avoids a second copy of a push token.
  device_id  uuid not null references devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (alert_id, device_id)
);

create index if not exists alert_recipients_alert_idx on alert_recipients (alert_id);

alter table alert_recipients enable row level security;

-- Staff read (so an operator can see reach). Written only by broadcast-alert
-- with the service key; no INSERT/UPDATE/DELETE policy exists for anyone else.
drop policy if exists "staff read recipients" on alert_recipients;
create policy "staff read recipients" on alert_recipients for select using (is_staff());

revoke insert, update, delete on alert_recipients from anon, authenticated;

-- The audit log gains the cancellation actions.
alter table alert_audit drop constraint if exists alert_audit_action_check;
alter table alert_audit add constraint alert_audit_action_check
  check (action in ('broadcast','repush','takedown','resolve','cancel_push'));
