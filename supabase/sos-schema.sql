-- ============================================================
-- NEMPA — SOS / emergency layer (applied 2026-07-05)
-- Adds: emergency contacts, SOS events (panic + danger),
-- live location pings, private audio-evidence bucket.
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Enums -----------------------------------------------------
do $$ begin
  create type sos_kind as enum ('sos', 'danger');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sos_status as enum ('active', 'resolved', 'cancelled');
exception when duplicate_object then null; end $$;

-- 2. Emergency contacts (per user, notified on SOS) ------------
create table if not exists emergency_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  phone       text not null,
  relation    text,
  created_at  timestamptz not null default now()
);
create index if not exists emergency_contacts_user_idx on emergency_contacts (user_id);

-- 3. SOS events ------------------------------------------------
-- kind 'sos'    = volume-down x5 panic: live location + contacts notified
-- kind 'danger' = volume-up long-press: high-priority platform report
--                 with background audio evidence + live location
create table if not exists sos_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         sos_kind not null default 'sos',
  priority     text not null default 'high' check (priority in ('high', 'critical')),
  status       sos_status not null default 'active',
  location     geography(point, 4326),
  address      text,
  audio_path   text,                 -- storage path in sos-evidence bucket
  notes        text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id) on delete set null
);
create index if not exists sos_events_status_idx on sos_events (status, created_at desc);
create index if not exists sos_events_user_idx   on sos_events (user_id, created_at desc);

-- 4. Live location pings (trail while an SOS is active) --------
create table if not exists sos_pings (
  id          bigint generated always as identity primary key,
  sos_id      uuid not null references sos_events(id) on delete cascade,
  location    geography(point, 4326) not null,
  accuracy_m  double precision,
  created_at  timestamptz not null default now()
);
create index if not exists sos_pings_sos_idx on sos_pings (sos_id, created_at desc);

-- 5. RLS -------------------------------------------------------
alter table emergency_contacts enable row level security;
alter table sos_events         enable row level security;
alter table sos_pings          enable row level security;

drop policy if exists "own contacts" on emergency_contacts;
create policy "own contacts" on emergency_contacts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own or staff sos" on sos_events;
create policy "read own or staff sos" on sos_events for select
  using (auth.uid() = user_id or is_staff());

drop policy if exists "raise own sos" on sos_events;
create policy "raise own sos" on sos_events for insert
  with check (auth.uid() = user_id and status = 'active');

-- owner may cancel / attach evidence; staff may resolve
drop policy if exists "update own or staff sos" on sos_events;
create policy "update own or staff sos" on sos_events for update
  using (auth.uid() = user_id or is_staff());

drop policy if exists "ping own active sos" on sos_pings;
create policy "ping own active sos" on sos_pings for insert
  with check (exists (
    select 1 from sos_events e
    where e.id = sos_id and e.user_id = auth.uid() and e.status = 'active'
  ));

drop policy if exists "read own or staff pings" on sos_pings;
create policy "read own or staff pings" on sos_pings for select
  using (exists (
    select 1 from sos_events e
    where e.id = sos_id and (e.user_id = auth.uid() or is_staff())
  ));

-- 6. Geo views (numeric lat/lng, same pattern as alerts_geo) ---
create or replace view sos_events_geo with (security_invoker = true) as
select
  s.*,
  st_y(s.location::geometry) as lat,
  st_x(s.location::geometry) as lng
from sos_events s;

create or replace view sos_pings_geo with (security_invoker = true) as
select
  p.*,
  st_y(p.location::geometry) as lat,
  st_x(p.location::geometry) as lng
from sos_pings p;

-- 7. Realtime (moderator dashboard + Gecko Intel live map) -----
do $$ begin
  alter publication supabase_realtime add table sos_events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table sos_pings;
exception when duplicate_object then null; end $$;

-- 8. Storage: PRIVATE bucket for SOS audio evidence ------------
-- Files live under <user_id>/<sos_id>.<ext>. Never public: access is
-- via signed URLs, owner or staff only.
insert into storage.buckets (id, name, public)
values ('sos-evidence', 'sos-evidence', false)
on conflict (id) do nothing;

drop policy if exists "sos-evidence upload own" on storage.objects;
create policy "sos-evidence upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'sos-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sos-evidence update own" on storage.objects;
create policy "sos-evidence update own" on storage.objects for update to authenticated
  using (bucket_id = 'sos-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sos-evidence read own or staff" on storage.objects;
create policy "sos-evidence read own or staff" on storage.objects for select to authenticated
  using (bucket_id = 'sos-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or is_staff()));
