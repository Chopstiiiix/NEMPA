-- ============================================================
-- Sparrowtell — direct-publish reports (applied 2026-07-05)
-- Reports now go live the moment they're filed; moderation is
-- retroactive (take down false reports) instead of a pre-gate.
-- Also adds a PII-safe side table for the MISSING PERSON's optional
-- phone + NIN (filled by the reporter if known): NEVER exposed
-- publicly — reporter + staff only (the alerts table itself is
-- publicly readable once verified).
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Let reporters file straight to 'verified' (or 'pending').
drop policy if exists "file report" on alerts;
create policy "file report" on alerts for insert
  with check (auth.uid() = reporter_id and status in ('pending', 'verified'));

-- 2. Missing person's private details — separate table so RLS can keep
--    it off the public alert surface (alerts_geo / alerts selects).
--    (Table name kept for back-compat; columns describe the person.)
create table if not exists alert_reporter_details (
  alert_id    uuid primary key references alerts(id) on delete cascade,
  phone       text,               -- missing person's phone, if known
  nin         text,               -- missing person's NIN, if known
  created_at  timestamptz not null default now()
);

alter table alert_reporter_details enable row level security;

drop policy if exists "reporter adds own details" on alert_reporter_details;
create policy "reporter adds own details" on alert_reporter_details for insert
  with check (exists (
    select 1 from alerts a
    where a.id = alert_id and a.reporter_id = auth.uid()
  ));

drop policy if exists "reporter or staff read details" on alert_reporter_details;
create policy "reporter or staff read details" on alert_reporter_details for select
  using (
    is_staff() or exists (
      select 1 from alerts a
      where a.id = alert_id and a.reporter_id = auth.uid()
    )
  );
