-- Asked on the page right after "Create an account": a phone number
-- (required in the UI) and "How did you hear about us?" (optional).
-- Both null for everyone who signed up before this page existed.

alter table public.user_profiles
  add column if not exists phone text
    check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  add column if not exists heard_about text
    check (heard_about is null or heard_about in (
      'instagram', 'youtube', 'google', 'friend', 'gym', 'facebook', 'x',
      'app_store', 'other'
    ));

-- user_profiles uses a column allowlist for client UPDATEs (billing lockdown).
-- Written only after the profile row exists, so no INSERT grant.
grant update (phone, heard_about) on table public.user_profiles to authenticated;
