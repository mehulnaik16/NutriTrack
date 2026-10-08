-- Rate limits for the Settings → Data export downloads.
--
-- Rolling windows from the last successful download of the same kind:
--   json (everything)          — 7 days for everyone
--   csv (food diary)           — 7 days paid, 30 days free
--   weight_pdf (weight report) — 7 days paid, 30 days free
-- "Paid" = premium active now AND at least one non-refunded charge. Free-trial
-- and referral/gift-only premium count as free.
--
-- The client asks data_export_status() before building a file and calls
-- record_data_export() after the download succeeded, so a failed export never
-- uses up the turn. record_data_export() re-checks the window, so two tabs
-- cannot both count.

create table if not exists public.data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('json', 'csv', 'weight_pdf')),
  created_at timestamptz not null default now()
);

create index if not exists data_exports_user_kind_idx
  on public.data_exports (user_id, kind, created_at desc);

alter table public.data_exports enable row level security;

-- Users may read their own history; all writes go through the function below.
drop policy if exists "data_exports_select_own" on public.data_exports;
create policy "data_exports_select_own" on public.data_exports
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.data_exports from anon, authenticated;

-- When each kind may next be downloaded (null = now), and whether the user is paid.
create or replace function public.data_export_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  paid boolean;
  out jsonb := '{}'::jsonb;
  k text;
  win interval;
  last_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select coalesce(p.access_until > now(), false)
         and exists (
           select 1 from public.subscription_charges c
            where c.user_id = uid and c.refunded_at is null
         )
    into paid
    from public.user_profiles p
   where p.id = uid;
  paid := coalesce(paid, false);

  foreach k in array array['json', 'csv', 'weight_pdf'] loop
    win := case when k = 'json' or paid then interval '7 days'
                else interval '30 days' end;
    select max(e.created_at) into last_at
      from public.data_exports e
     where e.user_id = uid and e.kind = k;
    out := out || jsonb_build_object(
      k,
      case when last_at is null or last_at + win <= now() then null
           else last_at + win end
    );
  end loop;

  return jsonb_build_object('paid', paid, 'next', out);
end;
$$;

-- Count one successful download. Returns false (and records nothing) when the
-- window has not passed yet.
create or replace function public.record_data_export(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  next_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('json', 'csv', 'weight_pdf') then
    raise exception 'unknown export kind' using errcode = '22023';
  end if;

  -- One at a time per user, so two tabs cannot both pass the check.
  perform pg_advisory_xact_lock(hashtext('data_export:' || uid::text));

  next_at := (public.data_export_status() -> 'next' ->> p_kind)::timestamptz;
  if next_at is not null then
    return false;
  end if;

  insert into public.data_exports (user_id, kind) values (uid, p_kind);
  return true;
end;
$$;

revoke execute on function public.data_export_status() from public, anon;
revoke execute on function public.record_data_export(text) from public, anon;
grant execute on function public.data_export_status() to authenticated;
grant execute on function public.record_data_export(text) to authenticated;
