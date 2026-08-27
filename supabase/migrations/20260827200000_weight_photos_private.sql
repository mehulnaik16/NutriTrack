-- Make the weight-photos bucket private.
--
-- 20260819_security_hardening.sql already contained this exact statement, but
-- its version was never recorded in supabase_migrations.schema_migrations and
-- the live bucket is still public:true — so the line never took effect. It is
-- reissued here on its own so that it is applied and tracked.
--
-- While the bucket is public, every progress photo is readable by anyone who
-- has its URL, with no authentication, including after the owner deletes their
-- account. Owner-scoped RLS on storage.objects (20260729152300_add_storage_rls)
-- is bypassed entirely for public buckets.
--
-- Nothing in the app needs changing: src/services/storage.ts already exposes
-- getSignedPhotoUrl(), and src/components/SignedPhoto.tsx already renders every
-- photo through it. Signed URLs are what a private bucket expects.

update storage.buckets
   set public = false
 where id = 'weight-photos';

-- Verify:
--   select id, public from storage.buckets where id = 'weight-photos';
