-- The browser log cache (src/lib/historyCache.ts) now keeps the recent,
-- still-editable days too, and validates them instead of refetching them.
-- log_version is that validator: it goes up on every insert, update or delete
-- in the four cached tables, whatever the row's date. history_version keeps
-- its meaning (an old, frozen row changed) and is bumped by the same update.
--
-- Clients can read it (own-profile RLS) but never write it: it is not in the
-- user_profiles column UPDATE grant list.

alter table public.user_profiles
  add column if not exists log_version bigint not null default 0;

create or replace function public.bump_history_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_col text := TG_ARGV[0];
  v_floor date := current_date - 6;
  v_old boolean :=
    (TG_OP in ('UPDATE', 'DELETE') and (to_jsonb(OLD) ->> v_col)::date < v_floor)
    or (TG_OP in ('INSERT', 'UPDATE') and (to_jsonb(NEW) ->> v_col)::date < v_floor);
begin
  update public.user_profiles
    set log_version = log_version + 1,
        history_version = history_version + case when v_old then 1 else 0 end
    where id = coalesce(NEW.user_id, OLD.user_id);
  return null;
end;
$$;

-- Trigger function: no caller ever needs EXECUTE. (create or replace keeps the
-- earlier revoke, restated so this file stands on its own.)
revoke execute on function public.bump_history_version() from public, anon, authenticated;
