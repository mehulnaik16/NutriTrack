-- Whether the user ticked "Send me tips, new features, and personalized offers"
-- on sign-up. Optional, so false unless they opted in.

alter table public.user_profiles
  add column if not exists marketing_opt_in boolean not null default false;

-- user_profiles uses column allowlists for client writes (billing lockdown);
-- the sign-up upsert writes this column, so it needs both.
grant insert (marketing_opt_in) on table public.user_profiles to authenticated;
grant update (marketing_opt_in) on table public.user_profiles to authenticated;
