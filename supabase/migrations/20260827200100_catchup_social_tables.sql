-- Catch-up migration: friendships, cheers, user_achievements.
--
-- These three tables exist in production with correct ON DELETE CASCADE foreign
-- keys to auth.users, so account deletion works today. They were applied as
-- migrations (20260815165750_create_friendships_and_cheers,
-- 20260816152523_user_achievements_and_award_rpc) whose .sql files are not in
-- this folder, so `supabase db reset` builds a database without them — one
-- where the friends UI is broken and account deletion cascades differently from
-- production.
--
-- Transcribed from the live schema, not reconstructed by hand. Written to be a
-- no-op against production: every statement is guarded, so applying this
-- changes nothing where the tables already exist.
--
-- The friend-lookup RPCs from those same migrations (resolve_friend_code,
-- search_users, suggested friends-of-friends, award_achievement) are still
-- missing locally and are NOT covered here — this migration only restores the
-- tables that account deletion depends on.

-- ── friendships ────────────────────────────────────────────────────────────
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'blocked')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- One row per pair regardless of who asked first.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id),
                         greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (auth.uid() = requester_id and status = 'pending');

-- Only the addressee resolves a pending request, and only to accepted/blocked.
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status in ('accepted', 'blocked'));

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ── cheers ─────────────────────────────────────────────────────────────────
create table if not exists public.cheers (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  date        date not null default current_date,
  created_at  timestamptz not null default now(),
  constraint cheers_no_self check (from_user <> to_user),
  constraint cheers_once_per_day unique (from_user, to_user, date)
);

create index if not exists cheers_to_user_idx on public.cheers (to_user, date);

alter table public.cheers enable row level security;

drop policy if exists cheers_select on public.cheers;
create policy cheers_select on public.cheers
  for select using (auth.uid() = from_user or auth.uid() = to_user);

-- You may only cheer someone you are actually friends with.
drop policy if exists cheers_insert on public.cheers;
create policy cheers_insert on public.cheers
  for insert with check (
    auth.uid() = from_user
    and exists (
      select 1 from public.friendships f
       where f.status = 'accepted'
         and ((f.requester_id = cheers.from_user and f.addressee_id = cheers.to_user)
           or (f.requester_id = cheers.to_user   and f.addressee_id = cheers.from_user))
    )
  );

-- ── user_achievements ──────────────────────────────────────────────────────
create table if not exists public.user_achievements (
  user_id         uuid not null references auth.users(id) on delete cascade,
  achievement_id  text not null,
  awarded_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;

drop policy if exists "own achievements select" on public.user_achievements;
create policy "own achievements select" on public.user_achievements
  for select using (user_id = auth.uid());

drop policy if exists "own achievements insert" on public.user_achievements;
create policy "own achievements insert" on public.user_achievements
  for insert with check (user_id = auth.uid());
