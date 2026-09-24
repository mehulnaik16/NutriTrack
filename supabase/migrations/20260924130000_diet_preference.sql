-- Diet preference, asked once in the /food setup modal (step 2, right after the
-- meal-names question). Write-only: the value is never shown back to the user
-- and has no editor in profile.tsx. NULL is the "not yet asked" gate, so the
-- column stays nullable with no default.
alter table public.user_profiles
  add column if not exists diet_preference text
  check (diet_preference in ('veg', 'veg_eggs', 'non_veg'));

comment on column public.user_profiles.diet_preference is
  'veg | veg_eggs | non_veg. Asked once in the /food setup modal; NULL means not yet asked. Write-only, never surfaced in the UI.';

-- user_profiles has a column-level grant allowlist, not just RLS
-- (20260901120000_billing_lockdown.sql:36) — without this the client UPDATE in
-- lib/meals.ts saveDietPreference() fails with 42501. Grants are additive, so
-- the existing list needs no restating. No insert grant: the quiz upsert does
-- not write this column.
grant update (diet_preference) on table public.user_profiles to authenticated;
