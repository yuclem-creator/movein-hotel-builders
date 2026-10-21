-- MOVEin Hotel Builders — Phase 2 schema (Supabase Postgres).
--
-- Deliberately two tables. A pilot room lives for one session: a facilitator creates a
-- room, teams submit one row each, the board reads them. Real-time co-building is NOT
-- part of this design; teams build locally and submit a finished score, which keeps the
-- simulation deterministic and the failure modes small.
--
-- Run this once in the SQL editor of a NEW project. Never run it against an existing
-- project that another product uses.
--
-- HONEST LIMITS (read before a real session):
--  * Policies below are open to the anon role, because a classroom has no accounts and
--    asking 30 New Joiners to sign in is not a pilot. Anyone with the anon key can read
--    and write any room. Use a project dedicated to this game, with no other data in it.
--  * The unique key is (room, team), so a team can overwrite its own row but not another
--    team's — unless it knows the other team's name, which it will. Phase 3 must add a
--    per-team secret (issued inside the QR link) before this is used for anything that
--    matters beyond a training room.
--  * No personal data belongs in here. Team names and hotel names only.

create table if not exists public.rooms (
  code        text primary key check (code ~ '^[A-Z0-9]{3,6}$'),
  label       text not null default '',
  rounds      int  not null default 4 check (rounds between 1 and 8),
  minutes     int  not null default 8 check (minutes between 3 and 60),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create table if not exists public.submissions (
  id          bigint generated always as identity primary key,
  room        text not null references public.rooms (code) on delete cascade,
  team        text not null check (char_length(team) between 1 and 24),
  hotel       text not null check (char_length(hotel) between 1 and 28),
  composite   int  not null check (composite between 0 and 100),
  fan         int  not null check (fan between 0 and 100),
  profit      int  not null check (profit between 0 and 100),
  colleague   int  not null check (colleague between 0 and 100),
  brand       int  not null check (brand between 0 and 100),
  layout_hash text not null check (char_length(layout_hash) between 3 and 12),
  placements  int  not null check (placements between 0 and 200),
  rounds      int  not null default 4 check (rounds between 1 and 8),
  code        text not null default '',
  created_at  timestamptz not null default now(),
  unique (room, team)
);

create index if not exists submissions_room_composite_idx
  on public.submissions (room, composite desc);

alter table public.rooms       enable row level security;
alter table public.submissions enable row level security;

-- Rooms: anyone may read a room and create one; nobody may delete history over the API.
drop policy if exists rooms_read   on public.rooms;
drop policy if exists rooms_create on public.rooms;
create policy rooms_read   on public.rooms for select using (true);
create policy rooms_create on public.rooms for insert with check (true);

-- Submissions: read a room's board; insert or replace your own row in that room.
drop policy if exists subs_read   on public.submissions;
drop policy if exists subs_write  on public.submissions;
drop policy if exists subs_update on public.submissions;
create policy subs_read   on public.submissions for select using (true);
create policy subs_write  on public.submissions for insert with check (
  exists (select 1 from public.rooms r where r.code = submissions.room and r.closed_at is null)
);
create policy subs_update on public.submissions for update using (
  exists (select 1 from public.rooms r where r.code = submissions.room and r.closed_at is null)
) with check (
  exists (select 1 from public.rooms r where r.code = submissions.room and r.closed_at is null)
);

-- Closing a room stops further submissions without deleting the board.
create or replace function public.close_room(room_code text)
returns void language sql security definer as $$
  update public.rooms set closed_at = now() where code = room_code;
$$;
