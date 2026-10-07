-- weight-photos had no size or type limit of its own: the 8 MB / JPEG-PNG-WebP
-- rule lived only in services/storage.ts, so a direct API call could store
-- any file of any size (up to the project-wide cap). Same rule, now enforced
-- by Storage itself. Keep in sync with MAX_PHOTO_BYTES / ALLOWED_PHOTO_TYPES.

update storage.buckets
set file_size_limit = 8388608, -- 8 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'weight-photos';
