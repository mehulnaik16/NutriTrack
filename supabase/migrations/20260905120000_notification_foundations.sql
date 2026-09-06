-- Notification foundations — preferences, reminders, and the delivery log.
--
-- Deliberately transport-agnostic. v1 schedules on the device via
-- @capacitor/local-notifications: the app reads these tables on foreground,
-- cancels everything pending, and hands the OS the current set. If a server
-- sender is added later, it reads exactly the same rows — the only additions
-- are a device_push_tokens table and a queue_job_id column, both purely
-- additive. Nothing here assumes which side does the scheduling.
--
-- Re-runnable. Every statement is guarded, so applying this twice is a no-op
-- rather than an error -- which matters because it may be applied through the
-- Supabase API (recording its own version) and later replayed by `db push`
-- from this file.
--
-- Account deletion needs no new code: every table below cascades from
-- auth.users, and src/lib/delete-account.ts already deletes the auth user and
-- lets the FKs do the rest.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Profile additions
-- ═══════════════════════════════════════════════════════════════════════

-- The scheduler needs to know what "07:00" means for this user, and the
-- motivation cycle needs a stable per-user shuffle seed.
--
-- No CHECK against pg_timezone_names: it is not IMMUTABLE, so it cannot be
-- used in a table constraint. The client writes this from
-- Intl.DateTimeFormat().resolvedOptions().timeZone, which only ever emits
-- valid IANA names, and a bad value degrades to a wrong-hour notification
-- rather than corrupt data.
alter table public.user_profiles
  add column if not exists timezone text not null default 'Asia/Kolkata';

-- Per-user seed for the reshuffled second pass through the 100 quotes.
-- Volatile default on purpose: Postgres evaluates it per row, so the backfill
-- gives every existing user their own seed rather than one shared value.
alter table public.user_profiles
  add column if not exists motivation_seed int not null default (floor(random() * 1000000)::int);

comment on column public.user_profiles.timezone is
  'IANA zone name, e.g. Asia/Kolkata. Written by the client on launch when the device zone differs. Drives local-time notification scheduling.';

comment on column public.user_profiles.motivation_seed is
  'Stable per-user seed. Combined with the cycle number it reorders the 100 motivation quotes on each pass, so day 101 is not a repeat of day 1 in the same order.';

-- 20260901120000_billing_lockdown.sql revoked the table-level UPDATE grant on
-- user_profiles and granted back an explicit column allowlist. A new column is
-- therefore unwritable by the client until it is named here — which is exactly
-- how 20260901133000 came to exist, after every signup started failing 42501.
--
-- src/lib/timezone.ts writes this on launch whenever the device zone differs.
grant update (timezone) on table public.user_profiles to authenticated;

-- motivation_seed is deliberately NOT granted. Nothing writes it: the column
-- default assigns one per row and it is only ever read. Leaving it off the
-- allowlist means a client attempting to reshuffle its own quote order fails at
-- the database rather than being caught only by convention.

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Preferences — one row per user
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.user_notification_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,

  morning_enabled   boolean not null default true,
  morning_time      time    not null default '07:00',

  -- Master switch for the custom reminder section. Off greys out every row
  -- without discarding the rows themselves.
  custom_enabled    boolean not null default true,

  allow_snooze      boolean not null default true,
  max_snooze_cycles int     not null default 3
    constraint snooze_cycles_in_range check (max_snooze_cycles between 1 and 3),

  -- Which snooze buttons appear on the notification, in seconds.
  -- The UI offers 600 / 1800 / 3600; the constraint keeps anything else out,
  -- since these values are handed straight to the OS scheduler.
  snooze_intervals  int[]   not null default array[600, 3600]
    constraint snooze_intervals_known check (
      array_length(snooze_intervals, 1) between 1 and 3
      and snooze_intervals <@ array[600, 1800, 3600]
    ),

  -- Quiet hours never apply to morning motivation. A user who sets their quote
  -- for 05:30 means 05:30 — deferring it to 06:01 would break the one
  -- notification whose entire value is the time it arrives. Only custom
  -- reminders and snooze reschedules are corrected out of this window.
  quiet_hours_on    boolean not null default false,
  quiet_from        time    not null default '22:00',
  quiet_to          time    not null default '06:00',

  updated_at        timestamptz not null default now()
);

comment on table public.user_notification_preferences is
  'One row per user. Absent row means the user has never opened notification settings; the client treats that as the defaults above.';

alter table public.user_notification_preferences enable row level security;

drop policy if exists "users manage own notification preferences" on public.user_notification_preferences;
create policy "users manage own notification preferences"
  on public.user_notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Custom reminders
-- ═══════════════════════════════════════════════════════════════════════

-- Implied throughout the design spec but never written out there. One row per
-- reminder. Each becomes a single repeating OS alarm — daily at a fixed local
-- time — so ten reminders cost ten of the 64 pending slots iOS allows, not one
-- slot per day.
create table if not exists public.custom_reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  -- Becomes the notification title. Capped at 20 to match the inline editor
  -- and to stay inside one line on a lock screen.
  label      text not null
    constraint reminder_label_length check (char_length(label) between 1 and 20),

  -- Becomes the notification body. Optional: when blank the client generates
  -- one from the label ("Breakfast" -> "Time for breakfast! Log your meal.").
  note       text
    constraint reminder_note_length check (note is null or char_length(note) <= 40),

  remind_at  time not null,
  enabled    boolean not null default true,

  -- Display order in the settings list. Not a schedule concern.
  sort_order int not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists custom_reminders_user on public.custom_reminders (user_id, sort_order);

alter table public.custom_reminders enable row level security;

drop policy if exists "users manage own custom reminders" on public.custom_reminders;
create policy "users manage own custom reminders"
  on public.custom_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The 10-per-user cap from spec §9.1. RLS lets the client insert directly, so
-- the UI is not a trust boundary — without this, a user with the network tab
-- open can schedule as many alarms as they like.
--
-- Two concurrent inserts at exactly nine rows can both pass and land on eleven.
-- Left as-is: the window is milliseconds wide, one row over does no harm, and
-- the alternative is serialising every reminder insert behind a lock.
create or replace function public.enforce_reminder_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.custom_reminders where user_id = new.user_id) >= 10 then
    raise exception 'Reminder limit reached (10 per user).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger custom_reminders_cap
  before insert on public.custom_reminders
  for each row execute function public.enforce_reminder_cap();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Delivery log
-- ═══════════════════════════════════════════════════════════════════════

-- What was scheduled, what the user did with it, and how many times they have
-- snoozed it. Under device scheduling the client is the only writer: it records
-- a row when it schedules, and updates status when the app next opens after an
-- action. A snooze tapped on the lock screen with the app closed has no session,
-- so the authoritative count rides in the notification's own `extra` payload
-- and is reconciled here on next launch.
create table if not exists public.notification_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  type        text not null
    constraint notification_type_known check (type in ('morning_motivation', 'custom_reminder')),

  -- Set for custom_reminder rows only. Deleting the reminder discards its
  -- history, which is what a user deleting a reminder expects.
  reminder_id uuid references public.custom_reminders(id) on delete cascade,

  -- The time this was originally meant to fire, preserved across snoozes so
  -- "you snoozed breakfast by 2 hours" stays answerable.
  original_scheduled_at timestamptz not null,
  current_scheduled_at  timestamptz not null,

  snooze_count       int not null default 0 constraint snooze_count_sane check (snooze_count >= 0),
  max_snooze_allowed int not null default 3,

  status text not null default 'pending'
    constraint notification_status_known check (
      status in ('pending', 'delivered', 'snoozed', 'dismissed', 'opened', 'archived')
    ),

  -- True when a snooze landed inside quiet hours and was pushed to the end of
  -- the window. Logged so a confused "why did this arrive at 6am" is diagnosable.
  quiet_hours_override boolean not null default false,

  -- The integer id handed to the OS scheduler, so a snooze can cancel the
  -- pending alarm before scheduling its replacement. Null once it has fired.
  os_notification_id int,

  -- Reserved for a future server queue. Deliberately not created now — see the
  -- header note on the push migration being additive.
  -- queue_job_id text,

  last_action_at timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists notification_logs_user_status
  on public.notification_logs (user_id, status);

-- Partial: the only rows ever queried by due-time are the ones still waiting.
create index if not exists notification_logs_due
  on public.notification_logs (current_scheduled_at)
  where status = 'pending';

alter table public.notification_logs enable row level security;

drop policy if exists "users manage own notification logs" on public.notification_logs;
create policy "users manage own notification logs"
  on public.notification_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
