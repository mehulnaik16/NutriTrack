-- ═══════════════════════════════════════════════════════════════════════
-- Gym partner links
-- ═══════════════════════════════════════════════════════════════════════
--
-- A Dombelz user can enter a gym's affiliate code (GYM-IRONVAULT-123). Where
-- they entered it is the only thing that decides money:
--
--   source = 'signup'   the member gets ₹150 off Yearly, and the gym earns 20%
--                       commission on every charge that member ever makes
--   source = 'profile'  nobody is paid. The member joins the gym's roster and
--                       that is all.
--
-- A gym that did not bring us the customer is not paid for them. In particular
-- a user who signed up with a *friend's* referral code can never attribute a
-- gym afterwards — see the referrals check in link_gym() below.
--
-- The gyms themselves live in a different Postgres instance (the Dombelz
-- Partner project), so partner_code and gym_name are a snapshot written by a
-- server that has already verified them there. There is no foreign key to
-- point at.

create table public.gym_links (
  -- One gym per user, and first link wins: attribution is never re-pointed
  -- after the fact. Same shape and same reason as referrals.referee_id.
  user_id       uuid primary key references auth.users(id) on delete cascade,
  partner_code  text not null,
  gym_name      text not null,
  source        text not null check (source in ('signup', 'profile')),
  -- The gym membership window. Informational only — it never touches
  -- access_until or anything else in the entitlement fold. Stored rather than
  -- derived so that changing the offered durations cannot silently move a
  -- window somebody already agreed to.
  plan_months   smallint check (plan_months in (1, 3, 6, 12)),
  start_date    date,
  end_date      date,
  -- Set by the first yearly charge. The gift is spent once, exactly like the
  -- friend gift, which spends by reaching referrals.status = 'subscribed'.
  gift_spent_at timestamptz,
  created_at    timestamptz not null default now()
);

create index gym_links_partner_code_idx on public.gym_links (partner_code);

alter table public.gym_links enable row level security;

-- Read-only for the member. There is deliberately no INSERT/UPDATE/DELETE
-- policy: link_gym() below is the single writer, and it is not reachable from
-- a browser at all.
create policy "Users read own gym link"
  on public.gym_links
  for select
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════
-- Attribution, decided here rather than asserted by the caller
-- ═══════════════════════════════════════════════════════════════════════
--
-- Note there is no p_source parameter. A client that could say "this was a
-- signup" could mint itself the discount and hand a gym a commission it never
-- earned, so the source is derived from facts about the account that cannot be
-- replayed.
--
-- p_user_id is trusted because this function is granted to service_role ONLY.
-- Its one caller is serverLinkGym() in src/lib/gym-link.ts, which takes the id
-- from a verified JWT, never from its own input. That is the same trust model
-- as serverConfirmCheckout(). It is deliberately NOT granted to authenticated:
-- p_gym_name is a snapshot of a row in another database, so only a server that
-- has actually looked it up there may write it.
--
-- Returns the source it chose, so the UI can show what was really granted
-- instead of promising a gift the database declined.
create or replace function public.link_gym(
  p_user_id     uuid,
  p_code        text,
  p_gym_name    text,
  p_plan_months smallint default null,
  p_start_date  date     default null,
  p_end_date    date     default null
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
  select p.trial_start_date into v_trial
    from public.user_profiles p where p.id = p_user_id;

  -- Every one of these must hold for the gym to earn anything.
  if      not exists (select 1 from public.referrals where referee_id = p_user_id)
      -- ^ the rule stated most emphatically: someone who signed up with a
      --   friend's code has had a referrals row since that moment, so a gym
      --   code added later is never attributed, however it is submitted.
      and v_trial is null
      and v_created is not null
      and v_created > now() - interval '15 minutes'
  then
    v_source := 'signup';
  else
    v_source := 'profile';
  end if;

  insert into public.gym_links
    (user_id, partner_code, gym_name, source, plan_months, start_date, end_date)
  values
    (p_user_id, normalized, btrim(p_gym_name), v_source,
     p_plan_months, p_start_date, p_end_date);

  return jsonb_build_object(
    'linked', true, 'source', v_source,
    'partner_code', normalized, 'gym_name', btrim(p_gym_name)
  );
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- Spending the gift
-- ═══════════════════════════════════════════════════════════════════════
--
-- A trigger on subscription_charges rather than another branch inside
-- handle_razorpay_event(). That function already guards insertion into this
-- table with a unique provider_payment_id, so a row appearing here IS a real,
-- first-time charge — the exact instant the friend gift is spent by its own
-- referrals UPDATE. Hooking the table instead of the function means a future
-- edit to the webhook handler cannot quietly drop this.
create or replace function public.spend_gym_gift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tier = 'yearly' then
    update public.gym_links
       set gift_spent_at = now()
     where user_id = new.user_id and gift_spent_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spend_gym_gift on public.subscription_charges;
create trigger trg_spend_gym_gift
  after insert on public.subscription_charges
  for each row execute function public.spend_gym_gift();


-- ═══════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════
-- Supabase grants EXECUTE to anon/authenticated by default on new functions,
-- so both must be revoked explicitly — revoking from `public` alone does not
-- remove a direct role grant. See 20260826120000_referrals_revoke_internal.sql
-- for the same lesson learned the hard way.
revoke all on function public.link_gym(uuid, text, text, smallint, date, date)
  from anon, authenticated, public;
grant execute on function public.link_gym(uuid, text, text, smallint, date, date)
  to service_role;

revoke all on function public.spend_gym_gift() from anon, authenticated, public;
