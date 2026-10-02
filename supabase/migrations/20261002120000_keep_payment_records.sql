-- Keep payment records after account deletion, and raise the minimum age to 18.
--
-- 1. Payment records. The Privacy Policy (§8) says payment and invoice records
--    may be kept for tax law after an account is deleted. Until now deleting
--    the auth user cascaded through subscriptions → subscription_charges →
--    refund_requests and wiped them. All three now keep their rows with
--    user_id set to null: anonymised, invisible to every client (each RLS
--    policy is auth.uid() = user_id, which never matches null), and still
--    there for GST / income-tax books.
--
--    Null-safe already: handle_razorpay_event() matches siblings with
--    user_id = sub.user_id (never true for null) and recompute_access(null)
--    returns at its "not found" guard, so a late webhook for a deleted user
--    records the event and changes nobody's access.
--
-- 2. Age. Terms §2: 18+. The quiz enforces it; this is the server-side guard.
--    NOT VALID like the original, so no existing row is re-checked (there were
--    no 16–17 year-old accounts when this shipped).

alter table public.subscriptions
  alter column user_id drop not null,
  drop constraint subscriptions_user_id_fkey,
  add constraint subscriptions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.subscription_charges
  alter column user_id drop not null,
  drop constraint subscription_charges_user_id_fkey,
  add constraint subscription_charges_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.refund_requests
  alter column user_id drop not null,
  drop constraint refund_requests_user_id_fkey,
  add constraint refund_requests_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.user_profiles
  drop constraint user_profiles_age_range,
  add constraint user_profiles_age_range
    check (age is null or (age >= 18 and age <= 100)) not valid;
