-- Allow 'theme-mono' in user_profiles.theme check constraint

alter table public.user_profiles
  drop constraint if exists user_profiles_theme_check;

alter table public.user_profiles
  add constraint user_profiles_theme_check
    check (theme in ('dark','light','theme-ocean','theme-sunset','theme-forest',
                     'theme-cyber','theme-cyberdeck','theme-isro','theme-mono'));
