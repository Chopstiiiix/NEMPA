-- ============================================================
-- Live-listen audio: an index of playable segments per SOS.
--
-- The recorder used to accumulate every MediaRecorder chunk and re-upload the
-- WHOLE take every 20s to a single object. That is fine as an evidence file
-- and useless for listening along: the object grows without bound (a 30-minute
-- SOS re-uploads an ever-larger file every 20 seconds, over the mobile
-- connection of someone in trouble), and an operator can only ever fetch the
-- entire thing again.
--
-- Segments are separate, complete, individually playable files. Gecko fetches
-- the ones it hasn't played yet and plays them in order, roughly 8s behind
-- live. True real-time would mean WebRTC — signalling, TURN, battery, and iOS
-- background limits — for a few seconds' gain.
-- ============================================================

create table if not exists sos_audio_segments (
  id         bigserial primary key,
  sos_id     uuid not null references sos_events(id) on delete cascade,
  seq        integer not null,          -- 1-based, gapless, ordering for playback
  path       text not null,             -- object path inside the sos-evidence bucket
  created_at timestamptz not null default now(),
  unique (sos_id, seq)
);

create index if not exists sos_audio_segments_sos_idx
  on sos_audio_segments (sos_id, seq);

alter table sos_audio_segments enable row level security;

-- The person raising the SOS writes their own segments straight from the
-- client — there is no server hop, because an emergency upload should not
-- depend on an Edge Function being warm.
drop policy if exists "insert own sos segments" on sos_audio_segments;
create policy "insert own sos segments" on sos_audio_segments for insert to authenticated
  with check (exists (
    select 1 from sos_events e where e.id = sos_id and e.user_id = auth.uid()
  ));

-- Owner sees their own; staff (and Gecko, via the service key) see everything.
drop policy if exists "read own sos segments or staff" on sos_audio_segments;
create policy "read own sos segments or staff" on sos_audio_segments for select to authenticated
  using (
    is_staff() or exists (
      select 1 from sos_events e where e.id = sos_id and e.user_id = auth.uid()
    )
  );

-- Nobody edits or deletes a segment index row: audio evidence that can be
-- silently rewritten is not evidence. Rows disappear only when the SOS event
-- itself is deleted (ON DELETE CASCADE), or with the account.
revoke update, delete on sos_audio_segments from anon, authenticated;

-- Storage layout is `<user_id>/<sos_id>/seg-0001.webm`. The existing
-- sos-evidence policies check `(storage.foldername(name))[1] = auth.uid()`,
-- which is still the user id under the extra nesting, so upload and read
-- continue to work unchanged.
