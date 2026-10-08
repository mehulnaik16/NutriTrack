/**
 * Centralized Storage Service for weight progress photos.
 *
 * Every upload, delete, or replace flows through here.
 * React components never call supabase.storage directly.
 *
 * Designed so the implementation can later be swapped to an
 * Edge Function without changing any component code.
 */

import { supabase } from "@/integrations/client";
import { daysAgoLocal } from "@/lib/dates";
import { isNativeApp } from "@/lib/platform";

const BUCKET = "weight-photos";
const MAX_SIDE = 1600;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// ── Types ────────────────────────────────────────────────────

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export interface StorageResult<T = void> {
  data: T | null;
  error: string | null;
}

// ── Helpers ──────────────────────────────────────────────────

/** Extract the storage object path from a full public URL. */
function extractPath(photoUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return null;
  // Strip query params (cache-busters like ?t=…)
  return photoUrl.slice(idx + marker.length).split("?")[0] || null;
}

/** Build a unique storage path: `<userId>/<timestamp>.<ext>` */
function buildPath(userId: string, file: File): string {
  const ext = file.name.split(".").pop() ?? "jpg";
  return `${userId}/${Date.now()}.${ext}`;
}

/**
 * Web only: shrink to MAX_SIDE px and re-encode as WebP (JPEG where the
 * browser can't encode WebP, e.g. older Safari). A 4 MB phone photo lands
 * around 200–400 KB. Any failure, or a result no smaller, keeps the original.
 */
async function compressPhoto(file: File): Promise<File> {
  if (isNativeApp()) return file;
  try {
    const bmp = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const encode = (type: string) =>
      new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.8));
    let blob = await encode("image/webp");
    if (blob?.type !== "image/webp") blob = await encode("image/jpeg");
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `photo.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Upload a weight progress photo.
 * Returns the storage path and public URL on success.
 */
export async function uploadWeightPhoto(
  original: File,
  userId: string,
): Promise<StorageResult<UploadResult>> {
  if (!ALLOWED_PHOTO_TYPES.includes(original.type)) {
    return { data: null, error: "Only JPEG, PNG, or WebP images are allowed." };
  }
  // Compress before the size check so big phone photos still go through.
  const file = await compressPhoto(original);
  if (file.size > MAX_PHOTO_BYTES) {
    return { data: null, error: "Image must be smaller than 8 MB." };
  }

  const path = buildPath(userId, file);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) {
    console.error("[storage] upload failed:", error.message);
    return { data: null, error: `Upload failed: ${error.message}` };
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    data: { path, publicUrl: urlData.publicUrl },
    error: null,
  };
}

/**
 * Resolve a stored photo reference into a short-lived signed URL.
 * The bucket is private, so the stored URL is only an object identifier —
 * it grants no access on its own and must be signed before rendering.
 */
export async function getSignedPhotoUrl(
  photoUrl: string,
): Promise<string | null> {
  const path = extractPath(photoUrl);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("[storage] signing failed:", error.message);
    return null;
  }
  return data.signedUrl;
}

// ── Browser photo cache (web only) ──────────────────────────
//
// A signed URL carries a fresh token every time, so the browser's own cache
// never matches and each view re-downloaded the photo. The bytes are cached
// here instead, keyed by object path. Paths are never reused (uploads are
// timestamped, upsert:false; a replaced photo gets a new path), so a cached
// copy is never wrong. The same split as lib/historyCache.ts sets how long one
// is kept: photos of entries older than 8 days are kept for a year; the
// latest week's are re-downloaded after a day. An entry crossing the cutoff
// moves to the long rule on its next read, with no download.

const PHOTO_CACHE = "dombelz-photos";
const RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const FROZEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** Object URLs already made this session, so remounts don't reread the cache. */
const objectUrls = new Map<string, string>();

const photoCacheOn = () => typeof caches !== "undefined" && !isNativeApp();
// Cache Storage needs a URL key; this one is never fetched.
const cacheKey = (path: string) => `/__photo-cache/${path}`;

/**
 * A displayable URL for a stored photo: a cached copy when there is a fresh
 * one, else a signed URL whose bytes are cached for next time. `date` is the
 * weight entry's date (YYYY-MM-DD); without it the photo counts as recent.
 */
export async function getPhotoSrc(
  photoUrl: string,
  date?: string,
): Promise<string | null> {
  const path = extractPath(photoUrl);
  if (!path || !photoCacheOn()) return getSignedPhotoUrl(photoUrl);
  const known = objectUrls.get(path);
  if (known) return known;

  try {
    const cache = await caches.open(PHOTO_CACHE);
    const ttl = date && date < daysAgoLocal(8) ? FROZEN_TTL_MS : RECENT_TTL_MS;
    const hit = await cache.match(cacheKey(path));
    const at = Number(hit?.headers.get("x-cached-at"));
    if (hit && Date.now() - at < ttl) return remember(path, await hit.blob());

    const signed = await getSignedPhotoUrl(photoUrl);
    if (!signed) return null;
    const res = await fetch(signed);
    if (!res.ok) return signed;
    const blob = await res.blob();
    await cache.put(
      cacheKey(path),
      new Response(blob, {
        headers: {
          "content-type": blob.type,
          "x-cached-at": String(Date.now()),
        },
      }),
    );
    return remember(path, blob);
  } catch {
    // Quota, private mode or a blocked cache: show it the old way.
    return getSignedPhotoUrl(photoUrl);
  }
}

function remember(path: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}

/** Drop one photo from the cache (it was deleted or replaced). */
async function forgetPhoto(path: string): Promise<void> {
  const url = objectUrls.get(path);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(path);
  if (photoCacheOn())
    await caches
      .open(PHOTO_CACHE)
      .then((c) => c.delete(cacheKey(path)))
      .catch(() => {});
}

/** Remove every cached photo; called on sign-out. */
export async function clearPhotoCache(): Promise<void> {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  if (typeof caches !== "undefined")
    await caches.delete(PHOTO_CACHE).catch(() => {});
}

/**
 * Delete a weight photo by its stored URL.
 * Safely extracts the object path first.
 */
export async function deleteWeightPhoto(
  photoUrl: string,
): Promise<StorageResult> {
  const path = extractPath(photoUrl);
  if (!path) {
    console.warn("[storage] could not extract path from:", photoUrl);
    // Not a real error — the object may never have existed or URL is malformed.
    // Treat as success so callers can proceed with DB cleanup.
    return { data: null, error: null };
  }

  await forgetPhoto(path);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error("[storage] delete failed:", error.message);
    return { data: null, error: `Delete failed: ${error.message}` };
  }

  return { data: null, error: null };
}

/** The photo already on this user's entry for `date`, if any. */
export async function existingPhotoUrl(
  userId: string,
  date: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("weight_entries")
    .select("photo_url")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  return data?.photo_url ?? null;
}

/**
 * Run the DB write that moves an entry from `oldUrl` to `newUrl`, keeping
 * storage in step so no file is left that no row points at:
 * - save fails → the just-uploaded `newUrl` is deleted, the old one kept;
 * - save works → the replaced/removed `oldUrl` is deleted.
 * The old file is only deleted after the row stops pointing at it, so a
 * failed save never leaves an entry showing a deleted photo.
 */
export async function commitPhotoChange(
  oldUrl: string | null,
  newUrl: string | null,
  save: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await save();
  if (error) {
    if (newUrl && newUrl !== oldUrl) await deleteWeightPhoto(newUrl);
    throw error;
  }
  if (oldUrl && oldUrl !== newUrl) {
    const del = await deleteWeightPhoto(oldUrl);
    if (del.error)
      console.warn("[storage] old photo cleanup failed:", del.error);
  }
}
