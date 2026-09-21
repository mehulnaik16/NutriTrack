-- Split "who brought this member" from "which gym they belong to".
--
-- `gym_links` did both jobs from one row keyed on user_id, which made the two
-- facts mutually exclusive. A member who signed up with a creator's code held
-- the only slot, so they could never connect to their gym; and removing a gym
-- deleted the row, which silently took the member's earned ₹150 with it.
--
-- After this:
--   gym_links        the code entered at SIGNUP. Immutable. This is what
--                    commission attribution and the ₹150 offer read, and
--                    nothing in the product deletes it any more.
--   gym_memberships  the gym the member joined from their profile. Freely
--                    joined and left, and worth no commission on its own —
--                    `attributed` is decided once, at signup, by link_gym().
--
-- The two are independent: a member attributed to a creator can belong to a
-- gym, a member with no code at all can belong to a gym, and leaving a gym
-- changes neither the attribution nor the offer.

create table if not exists public.gym_memberships (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  -- Gym codes only. A doctor and a creator have no roster to join, no
  -- membership window and nobody to confirm details with, so a membership row
  -- for one would describe nothing. The client enforces this too; this is the
  -- copy that cannot be bypassed.
  partner_code text not null check (partner_code ~ '^GYM-[A-Z]{1,12}-[0-9]{3}$'),
  gym_name     text not null check (length(btrim(gym_name)) between 1 and 80),
  created_at   timestamptz not null default now()
);

-- RLS on with no policy, matching gym_members and gym_commissions on the
-- partner side: the table is unreachable directly and every read goes through
-- a server function holding the service-role key.
alter table public.gym_memberships enable row level security;
revoke all on public.gym_memberships from anon, authenticated;

comment on table public.gym_memberships is
  'The gym a member joined from their profile. Independent of gym_links, '
  'which records the code used at signup and never changes.';

-- Backfill. A gym code at signup made the member part of that gym's roster,
-- so those rows are memberships as well as attributions. Doctor and creator
-- rows are attribution only and are deliberately not copied.
insert into public.gym_memberships (user_id, partner_code, gym_name, created_at)
select user_id, partner_code, gym_name, created_at
  from public.gym_links
 where partner_type = 'gym'
on conflict (user_id) do nothing;

/**
 * Join a gym, or move to a different one.
 *
 * Deliberately says nothing about commission: `sync_gym_member` on the partner
 * side keeps whatever `attributed` was decided at first link, so joining a gym
 * here can never make it a paying referral.
 */
create or replace function public.join_gym(
  p_user_id uuid,
  p_code    text,
  p_gym_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := upper(btrim(coalesce(p_code, '')));
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;

  if normalized !~ '^GYM-[A-Z]{1,12}-[0-9]{3}$' then
    raise exception 'Not a gym code: %', p_code using errcode = 'P0002';
  end if;

  if coalesce(btrim(p_gym_name), '') = '' then
    raise exception 'A verified gym name is required' using errcode = 'P0001';
  end if;

  insert into public.gym_memberships (user_id, partner_code, gym_name)
  values (p_user_id, normalized, btrim(p_gym_name))
  on conflict (user_id) do update
    set partner_code = excluded.partner_code,
        gym_name     = excluded.gym_name,
        created_at   = now();

  return jsonb_build_object(
    'joined', true, 'partner_code', normalized, 'gym_name', btrim(p_gym_name));
end; $$;

/**
 * Leave the gym. Touches nothing else.
 *
 * In particular it does not touch gym_links, so the member keeps the ₹150 they
 * earned by signing up with a code — the user's ruling is that the offer is
 * spent by buying, not by staying linked. Taking them off the gym's roster is
 * the caller's job, on the partner side.
 */
create or replace function public.leave_gym(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;
  delete from public.gym_memberships where user_id = p_user_id;
  return jsonb_build_object('left', true);
end; $$;

revoke all on function public.join_gym(uuid, text, text) from public, anon, authenticated;
revoke all on function public.leave_gym(uuid) from public, anon, authenticated;
grant execute on function public.join_gym(uuid, text, text) to service_role;
grant execute on function public.leave_gym(uuid) to service_role;
