-- Morning motivation pauses while the user is away, instead of skipping.
--
-- Until now the quote for a day was a pure function of the calendar: days since
-- signup picked the position in the 100. A user who stopped opening the app ran
-- out of scheduled quotes after 30 days, and on their return the cycle had
-- moved on without them — the quotes for the missing days were skipped.
--
-- These three columns record where the user actually is, so the next schedule
-- continues from the last quote the phone was handed rather than from the
-- calendar. They describe the window the device scheduled most recently:
--
--   motivation_next_index  absolute quote position (0-based, across cycles) of
--                          the first slot in that window. Position n is quote
--                          n % 100 of cycle n / 100.
--   motivation_next_at     when that first slot fires.
--   motivation_scheduled   how many consecutive daily slots follow it. 0 means
--                          nothing is scheduled (morning quotes switched off),
--                          so the position stays frozen.
--
-- On the next reconcile the client counts the slots whose time has passed and
-- advances by that many — at most motivation_scheduled, which is what makes a
-- long absence a pause rather than a skip.
--
-- Null next_index means "never recorded": the client falls back to the old
-- calendar position once, so existing users carry on from where they are.
--
-- Additive and nullable. Covered by the table-level grants and the existing
-- per-user RLS policy; no new grant needed.

alter table public.user_notification_preferences
  add column if not exists motivation_next_index int
    constraint motivation_next_index_nonneg check (motivation_next_index >= 0),
  add column if not exists motivation_next_at timestamptz,
  add column if not exists motivation_scheduled int not null default 0
    -- iOS caps an app at 64 pending notifications, so no window is larger.
    constraint motivation_scheduled_range check (motivation_scheduled between 0 and 64);

comment on column public.user_notification_preferences.motivation_next_index is
  'Absolute quote position of the first slot in the last scheduled window. Null until first recorded.';
comment on column public.user_notification_preferences.motivation_next_at is
  'When the first slot of the last scheduled window fires.';
comment on column public.user_notification_preferences.motivation_scheduled is
  'Consecutive daily slots scheduled from motivation_next_at. 0 when morning quotes are off.';
