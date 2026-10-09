-- Single progress-photo downloads, and the weight PDF going monthly for all.
--
-- Users can now download any one photo (dated in the corner) from the weight
-- entry dialog, so the whole-report PDF drops to once per rolling 30 days for
-- paid users too. Single downloads are capped at 31 per calendar month
-- (India time), counted here so a reload or a second tab cannot reset it.

-- weight_pdf: 30 days for everyone; json 7 for everyone; csv 7 paid / 30 free.
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
    win := case when k = 'json' or (k = 'csv' and paid) then interval '7 days'
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

create table if not exists public.photo_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists photo_downloads_user_idx
  on public.photo_downloads (user_id, created_at desc);

alter table public.photo_downloads enable row level security;

drop policy if exists "photo_downloads_select_own" on public.photo_downloads;
create policy "photo_downloads_select_own" on public.photo_downloads
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.photo_downloads from anon, authenticated;

-- Count one download. False (nothing recorded) once 31 are used this month.
create or replace function public.claim_photo_download()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  month_start timestamptz :=
    date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  used int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('photo_download:' || uid::text));
  select count(*) into used from public.photo_downloads
   where user_id = uid and created_at >= month_start;
  if used >= 31 then
    return false;
  end if;
  insert into public.photo_downloads (user_id) values (uid);
  return true;
end;
$$;

revoke execute on function public.claim_photo_download() from public, anon;
grant execute on function public.claim_photo_download() to authenticated;
