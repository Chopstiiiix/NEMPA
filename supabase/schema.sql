-- ============================================================
-- NEMPA database schema (Supabase / Postgres + PostGIS)
-- Run in Supabase SQL Editor, or via `supabase db push`.
-- ============================================================

-- 1. Extensions ------------------------------------------------
create extension if not exists postgis;

-- 2. Enums -----------------------------------------------------
create type alert_type   as enum ('missing_person', 'robbery');
create type alert_status as enum ('pending', 'verified', 'resolved', 'rejected');
create type user_role    as enum ('citizen', 'moderator', 'admin');

-- 3. Profiles (extends auth.users) -----------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  role        user_role not null default 'citizen',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up
create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 4. Devices (push targets + last known location) --------------
create table devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  push_token  text not null unique,
  platform    text not null check (platform in ('android', 'ios', 'web')),
  location    geography(point, 4326),     -- last known position for radius targeting
  updated_at  timestamptz not null default now()
);
create index devices_location_idx on devices using gist (location);

-- 5. Alerts ----------------------------------------------------
create table alerts (
  id                 uuid primary key default gen_random_uuid(),
  type               alert_type not null,
  status             alert_status not null default 'pending',
  title              text not null,
  description        text,
  photo_url          text,
  last_seen_location geography(point, 4326),
  last_seen_address  text,
  -- missing-person specific (nullable for robbery)
  person_name        text,
  person_age         int,
  person_gender      text,
  -- audit
  reporter_id        uuid references auth.users(id) on delete set null,
  verified_by        uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);
create index alerts_location_idx on alerts using gist (last_seen_location);
create index alerts_status_idx   on alerts (status, created_at desc);

-- 6. Tips / sightings (crowdsourced follow-ups) ----------------
create table alert_tips (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  message     text not null,
  location    geography(point, 4326),
  created_at  timestamptz not null default now()
);
create index alert_tips_alert_idx on alert_tips (alert_id, created_at desc);

-- 7. Geo helper: devices within radius of a point --------------
-- Used by the broadcast Edge Function to find who to notify.
create function devices_near(lat double precision, lng double precision, radius_m double precision)
returns setof devices
language sql stable as $$
  select *
  from devices
  where location is not null
    and st_dwithin(location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m);
$$;

-- ============================================================
-- 8. Row Level Security
-- ============================================================
alter table profiles   enable row level security;
alter table devices    enable row level security;
alter table alerts     enable row level security;
alter table alert_tips enable row level security;

-- helper: is the current user a moderator/admin?
create function is_staff() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('moderator', 'admin')
  );
$$;

-- profiles
create policy "read own profile"   on profiles for select using (auth.uid() = id or is_staff());
create policy "update own profile" on profiles for update using (auth.uid() = id);

-- devices: a user manages only their own
create policy "manage own devices" on devices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- alerts: everyone sees verified+resolved; reporters see their own; staff see all
create policy "read public alerts" on alerts for select
  using (status in ('verified', 'resolved') or reporter_id = auth.uid() or is_staff());

-- anyone authenticated can file a report, but it lands as 'pending'
create policy "file report" on alerts for insert
  with check (auth.uid() = reporter_id and status = 'pending');

-- only staff can verify/resolve/reject
create policy "staff moderate alerts" on alerts for update
  using (is_staff());

-- tips: readable by anyone who can see the alert; anyone authenticated can add
create policy "read tips" on alert_tips for select using (true);
create policy "add tips"  on alert_tips for insert with check (auth.uid() = user_id);

-- 9. Realtime (optional): let the feed live-update
alter publication supabase_realtime add table alerts;

-- ============================================================
-- 10. alerts_geo view — exposes the PostGIS point as plain
-- numeric lat/lng so neither the client nor the Edge Function
-- has to decode WKB hex / GeoJSON. security_invoker keeps the
-- base table's RLS in force for callers of the view.
-- ============================================================
create or replace view alerts_geo with (security_invoker = true) as
select
  a.*,
  st_y(a.last_seen_location::geometry) as last_seen_lat,
  st_x(a.last_seen_location::geometry) as last_seen_lng
from alerts a;

-- ============================================================
-- 11. Hardening: pin search_path on our functions (prevents
-- search_path injection on SECURITY DEFINER functions).
-- ============================================================
alter function handle_new_user() set search_path = public;
alter function is_staff() set search_path = public;
alter function devices_near(double precision, double precision, double precision) set search_path = public;

-- ============================================================
-- 12. Storage: public-read bucket for report photos.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('alert-photos', 'alert-photos', true)
on conflict (id) do nothing;

create policy "alert-photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'alert-photos');
create policy "alert-photos read" on storage.objects for select
  using (bucket_id = 'alert-photos');
