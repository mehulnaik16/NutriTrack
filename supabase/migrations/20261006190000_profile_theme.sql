-- The app theme follows the account, not the device. It used to live only in
-- localStorage, so one account showed different themes on different devices.
-- Null = never chosen on any device; the first device to load backfills it.

alter table public.user_profiles
  add column if not exists theme text
    check (theme in ('dark','light','theme-ocean','theme-sunset','theme-forest',
                     'theme-cyber','theme-cyberdeck','theme-isro'));

-- user_profiles uses a column allowlist for client UPDATEs (billing lockdown).
grant update (theme) on table public.user_profiles to authenticated;
