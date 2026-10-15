-- Part 7: storage. One private bucket; its policies are in 05_rls_policies.sql.
-- Run this before 05 (or re-run 05's storage section after it) only if your
-- tool insists on the bucket existing first; Postgres does not.
-- The 3 objects in the old bucket (weight photos) are files, not SQL: move
-- them with the dashboard or the storage API if you migrate user data.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('weight-photos', 'weight-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
