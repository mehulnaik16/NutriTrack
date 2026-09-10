-- The gym membership window stops living here, and leaving becomes possible.
--
-- Two changes, both consequences of one decision: the gym's own database is now
-- the single home for what plan a member pays for at the gym, when it starts
-- and when it ends. Dombelz reads it live over the bridge it already has.
--
-- That is what makes the gym owner's edits reach the customer at all. The
-- bridge is one-way by design — Dombelz calls the partner project and the
-- partner project never calls back — so a second copy here could only be kept
-- current by building a callback. Reading through instead means the owner edits
-- their own record and the customer's page shows it on the next load, with no
-- new infrastructure and no two copies to disagree.
--
--   plan_months / start_date / end_date  -> gym_members, in the partner project
--   partner_code / gym_name / source / gift_spent_at  -> stay here
--
-- What stays is attribution and identity: who brought us this customer, and
-- therefore who earns commission and whether the one-time ₹150 offer applies.
-- Nothing being dropped was ever read for money — recompute_access() and
-- premium_grants() never touch this table, and activeGift() reads only `source`
-- and `gift_spent_at`.
--
-- The second change is that a customer can now leave, which they never could:
-- gym_links has a SELECT-only policy and link_gym() is insert-only, so once
-- linked a member was stuck with that gym permanently.
--
-- Leaving is deliberately not reversible. Removing the gym burns attribution
-- for good: that gym earns nothing on this customer again, even though they
-- signed them up, and the ₹150 offer is spent whether or not it was ever used.
-- The burn itself is recorded twice, on purpose, because two different
-- questions are being answered in two different places:
--
--   here                          "does this account still get ₹849?"  — pricing
--   gym_attribution_burns (partner) "does this gym get paid?"          — money
--
-- Keeping the money answer in the partner database is the same rule the rest of
-- this integration follows: a bug on the Dombelz side must not be able to pay
-- anyone.

alter table public.user_profiles
  add column if not exists gym_attribution_ended_at timestamptz;

comment on column public.user_profiles.gym_attribution_ended_at is
  'When this account removed its gym. Non-null means the one-time ₹150 gym '
  'offer is spent for good — activeGift() must never return "gym" again, '
  'however many times they link afterwards.';

-- link_gym() loses three parameters, so the old signature has to go rather than
-- linger as an overload that a call by named arguments could not resolve.
drop function if exists public.link_gym(uuid, text, text, smallint, date, date);

alter table public.gym_links
  drop column if exists plan_months,
  drop column if exists start_date,
  drop column if exists end_date;

/**
 * Attribute an account to a gym.
 *
 * Membership details are no longer taken here — they are the gym's record and
 * reach it through submit_member_request() in the partner project, where the
 * owner confirms them. This function now answers exactly one question: does
 * this gym get credit for bringing us this customer?
 *
 * First link still wins, and re-calling with an existing row still changes
 * nothing. What is new is that a burned account can never buy back the signup
 * rate: however new the account looks, it links as 'profile', which earns the
 * gym nothing and carries no ₹150.
 */
create or replace function public.link_gym(
  p_user_id   uuid,
  p_code      text,
  p_gym_name  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := upper(btrim(coalesce(p_code, '')));
  existing   public.gym_links%rowtype;
  v_source   text;
  v_created  timestamptz;
  v_trial    date;
  v_burned   timestamptz;
begin
  if p_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if normalized !~ '^GYM-[A-Z]{1,12}-[0-9]{3}$' then
    raise exception 'Not a gym code: %', p_code using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_gym_name), '') = '' then
    raise exception 'A verified gym name is required' using errcode = 'P0001';
  end if;

  -- First link wins. Returning the existing row rather than raising keeps a
  -- caller retry harmless.
  select * into existing from public.gym_links where user_id = p_user_id;
  if found then
    return jsonb_build_object(
      'linked', false, 'source', existing.source,
      'partner_code', existing.partner_code, 'gym_name', existing.gym_name
    );
  end if;

  select u.created_at into v_created from auth.users u where u.id = p_user_id;
  select p.trial_start_date, p.gym_attribution_ended_at into v_trial, v_burned
    from public.user_profiles p where p.id = p_user_id;

  -- Every one of these must hold for the gym to earn anything.
  if      v_burned is null
      -- ^ NEW. Having removed a gym once spends the offer permanently, so a
      --   later link is never attributed however it is made.
      and not exists (select 1 from public.referrals where referee_id = p_user_id)
      -- ^ someone who signed up with a friend's code has had a referrals row
      --   since that moment, so a gym code added later is never attributed.
      and v_trial is null
      and v_created is not null
      and v_created > now() - interval '15 minutes'
  then
    v_source := 'signup';
  else
    v_source := 'profile';
  end if;

  insert into public.gym_links (user_id, partner_code, gym_name, source)
  values (p_user_id, normalized, btrim(p_gym_name), v_source);

  return jsonb_build_object(
    'linked', true, 'source', v_source,
    'partner_code', normalized, 'gym_name', btrim(p_gym_name)
  );
end;
$$;

/**
 * Remove this account's gym, and spend its offer.
 *
 * Idempotent: calling it twice is not an error, and the timestamp is only
 * stamped once so a second removal cannot look like a fresh one. The caller is
 * responsible for burning attribution on the partner side first — see
 * serverUnlinkGym, which does the partner call before this one so a partner
 * outage aborts before the local row is gone.
 */
create or replace function public.unlink_gym(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if p_user_id is null then
    raise exception 'Unauthorized';
  end if;

  delete from public.gym_links where user_id = p_user_id;
  get diagnostics v_n = row_count;

  update public.user_profiles
     set gym_attribution_ended_at = coalesce(gym_attribution_ended_at, now())
   where id = p_user_id;

  return jsonb_build_object('removed', v_n > 0);
end;
$$;

revoke all on function public.link_gym(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.link_gym(uuid, text, text) to service_role;

revoke all on function public.unlink_gym(uuid) from public, anon, authenticated;
grant execute on function public.unlink_gym(uuid) to service_role;
