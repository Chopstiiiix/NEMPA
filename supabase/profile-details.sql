-- Applied to the live project (ticnoeumdvticwtuaujd) on 2026-07-21 as the
-- `profile_details_and_role_lockdown` migration.

-- 1. Responder-relevant profile fields, so an SOS can name the person.
alter table profiles
  add column if not exists address text,
  add column if not exists details text;

-- 2. SECURITY FIX. "update own profile" checks only that the row belongs to the
-- caller — it never constrained WHICH columns change, and both anon and
-- authenticated held table-wide UPDATE. So any signed-in user could
--     PATCH /rest/v1/profiles?id=eq.<self>  {"role":"admin"}
-- which makes is_staff() true and unlocks every profile, every pending alert,
-- every SOS event with its live location trail, and alert_reporter_details
-- (the phone/NIN of missing people).
--
-- Column-level grants rather than a WITH CHECK on the policy: a policy that
-- compares against the caller's current role has to read profiles from inside a
-- profiles policy, which recurses.
revoke update on profiles from anon, authenticated;
grant update (full_name, phone, address, details) on profiles to authenticated;

-- 3. Expose the reporter on the SOS feed so Gecko can name them.
-- LEFT JOIN + security_invoker keeps profiles RLS in force: the owner sees their
-- own row, staff and service_role see all, anyone else gets NULLs (not a dropped
-- row, which an INNER JOIN would cause).
create or replace view sos_events_geo with (security_invoker = true) as
select
  s.*,
  st_y(s.location::geometry) as lat,
  st_x(s.location::geometry) as lng,
  p.full_name as reporter_name,
  p.phone     as reporter_phone,
  p.address   as reporter_address,
  p.details   as reporter_details
from sos_events s
left join profiles p on p.id = s.user_id;
