-- Progress photos are a paid feature. The UI locks the upload; the storage
-- policies only checked the caller's own folder, so a free or lapsed user
-- could still upload through the API. Uploading and overwriting now also
-- need current access. Reading and deleting stay open: a lapsed user keeps
-- seeing their photos and can still remove them.
--
-- A plain read of the caller's own access_until (RLS lets users read their
-- own profile), no SECURITY DEFINER and no recompute. Unlike the food-write
-- trigger, a referral bonus whose hold just elapsed is not recomputed here;
-- the next page load or food write recomputes it, then uploads work.

drop policy if exists "Users upload own photos" on storage.objects;
create policy "Users upload own photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'weight-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and exists (
      select 1 from public.user_profiles
      where id = (select auth.uid()) and access_until > now()
    )
  );

drop policy if exists "Users update own photos" on storage.objects;
create policy "Users update own photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'weight-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'weight-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and exists (
      select 1 from public.user_profiles
      where id = (select auth.uid()) and access_until > now()
    )
  );
