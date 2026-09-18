-- ═══════════════════════════════════════════════════════════════════════
-- A partner code no longer has to be a gym code
-- ═══════════════════════════════════════════════════════════════════════
--
-- The partner project now issues three kinds of referral code — gyms, doctors
-- and UGC creators — and all three are meant to run through the offer,
-- discount and commission machinery gym codes already use. This side rejected
-- two of them at the door: link_gym() matched '^GYM-[A-Z]{1,12}-[0-9]{3}$' and
-- raised on anything else.
--
-- What does NOT change, deliberately:
--
--   * The attribution rules. `source` is still derived, never asserted, from
--     the same four facts: no earlier burn, no friend referral, no trial
--     started, and an account under fifteen minutes old. A doctor's code
--     entered at signup earns exactly what a gym's would, and one entered
--     later earns exactly as little.
--
--   * One partner per member. gym_links.user_id is still the primary key and
--     the first link still wins, returning the existing row rather than
--     raising. The spec calls a UGC/doctor code a one-time entry, which is
--     what this already was.
--
--   * The table name. Renaming gym_links would touch its RLS policy, its
--     grants, spend_gym_gift(), useReferralGift.ts and billing.ts for no
--     behavioural gain. A comment carries the widened meaning instead.


-- 1. WHICH KIND OF PARTNER ----------------------------------------------------
-- Default 'gym' backfills every row written before this migration, all of
-- which were gyms by definition. Kept as a default rather than dropped: unlike
-- the partner project, nothing here inserts without going through link_gym(),
-- and that function always passes a value.

alter table public.gym_links
  add column if not exists partner_type text not null default 'gym'
    check (partner_type in ('gym', 'doctor', 'ugc'));

comment on table public.gym_links is
  'Which partner a member is attributed to. Named when a partner could only be '
  'a gym; partner_type now says which of the three kinds it is, and gym_name '
  'holds whichever of gym / clinic / creator name applies.';

comment on column public.gym_links.partner_type is
  'Mirrors gym_partners.partner_type in the partner project. Decides only what '
  'the app calls this partner — the offer, the discount and the commission are '
  'identical for all three.';

comment on column public.gym_links.gym_name is
  'The partner''s display name, snapshotted from the partner project at link '
  'time: a gym name, a clinic name, or a creator''s own name.';


-- 2. ACCEPTING THE OTHER TWO SHAPES -------------------------------------------
-- The three shapes, and why they cannot be confused with each other or with a
-- friend referral code (^[A-Z]{3}[0-9]{5}$):
--
--   gym     GYM-IRONVAULT-123    starts 'GYM-', contains hyphens
--   doctor  DR-ANANYA304         starts 'DR-', contains a hyphen
--   ugc     PRIYAFITQUEEN60      no hyphen, ends in exactly 2 or 3 digits
--
-- A friend code has no hyphen and ends in exactly five digits, so it cannot be
-- any of the three. The UGC case is the tight one and is the reason the partner
-- project strips handles to LETTERS rather than alphanumerics: keep the digits
-- and @abc123 becomes ABC123 + '60' = ABC12360, which is three letters then
-- five digits — a friend code's shape exactly. quiz.tsx and GymLink.tsx
-- classify a pasted code by shape alone, with no round trip, so that collision
-- would route a creator's code into claim_referral(). src/lib/gym.test.ts pins
-- the disjointness on the TypeScript side; this regex is the server's copy.

drop function if exists public.link_gym(uuid, text, text);

create or replace function public.link_gym(
  p_user_id      uuid,
  p_code         text,
  p_gym_name     text,
  p_partner_type text default 'gym'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  normalized text := upper(btrim(coalesce(p_code, '')));
  existing   public.gym_links%rowtype;
  v_source   text; v_created timestamptz; v_trial date; v_burned timestamptz;
begin
  if p_user_id is null then raise exception 'Unauthorized'; end if;

  if normalized !~ '^(GYM-[A-Z]{1,12}-[0-9]{3}|DR-[A-Z]{1,6}[0-9]{3}|[A-Z]{1,20}(60|[0-9]{3}))$' then
    raise exception 'Not a partner code: %', p_code using errcode = 'P0002';
  end if;

  if p_partner_type is null or p_partner_type not in ('gym', 'doctor', 'ugc') then
    raise exception 'Unknown partner type: %', p_partner_type using errcode = 'P0001';
  end if;

  -- A snapshot of a row in another database, so only a server that has actually
  -- looked it up may write it. Same reason this function is service_role only.
  if coalesce(btrim(p_gym_name), '') = '' then
    raise exception 'A verified partner name is required' using errcode = 'P0001';
  end if;

  -- First link wins. Returning the existing row rather than raising is what
  -- makes a double-tap harmless.
  select * into existing from public.gym_links where user_id = p_user_id;
  if found then
    return jsonb_build_object('linked', false, 'source', existing.source,
      'partner_code', existing.partner_code, 'gym_name', existing.gym_name,
      'partner_type', existing.partner_type);
  end if;

  select u.created_at into v_created from auth.users u where u.id = p_user_id;
  select p.trial_start_date, p.gym_attribution_ended_at into v_trial, v_burned
    from public.user_profiles p where p.id = p_user_id;

  -- Unchanged. Derived here, never taken from the caller, because this is the
  -- single fact that decides whether anybody gets paid.
  if      v_burned is null
      and not exists (select 1 from public.referrals where referee_id = p_user_id)
      and v_trial is null
      and v_created is not null
      and v_created > now() - interval '15 minutes'
  then v_source := 'signup';
  else v_source := 'profile';
  end if;

  insert into public.gym_links (user_id, partner_code, gym_name, source, partner_type)
  values (p_user_id, normalized, btrim(p_gym_name), v_source, p_partner_type);

  return jsonb_build_object('linked', true, 'source', v_source,
    'partner_code', normalized, 'gym_name', btrim(p_gym_name),
    'partner_type', p_partner_type);
end; $$;

-- p_user_id is a parameter, so no browser may ever reach this. The server
-- functions in src/lib/gym-link.ts take the id from a verified JWT instead.
revoke all on function public.link_gym(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.link_gym(uuid, text, text, text) to service_role;
