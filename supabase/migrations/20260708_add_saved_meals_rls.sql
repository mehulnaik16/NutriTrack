alter table public.saved_meals enable row level security;

create policy "users manage own saved meals" on public.saved_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
