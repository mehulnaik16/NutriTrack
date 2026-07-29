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

const BUCKET = "weight-photos";

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

// ── Public API ───────────────────────────────────────────────

/**
 * Upload a weight progress photo.
 * Returns the storage path and public URL on success.
 */
export async function uploadWeightPhoto(
  file: File,
  userId: string,
): Promise<StorageResult<UploadResult>> {
  const path = buildPath(userId, file);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });

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
 * Delete a weight photo by its public URL.
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

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error("[storage] delete failed:", error.message);
    return { data: null, error: `Delete failed: ${error.message}` };
  }

  return { data: null, error: null };
}

/**
 * Replace a weight photo: upload new, verify, then delete old.
 * Never deletes the old image unless the new upload succeeds.
 */
export async function replaceWeightPhoto(
  oldPhotoUrl: string | null,
  newFile: File,
  userId: string,
): Promise<StorageResult<UploadResult>> {
  // 1. Upload new
  const uploadResult = await uploadWeightPhoto(newFile, userId);
  if (uploadResult.error || !uploadResult.data) {
    return uploadResult;
  }

  // 2. Delete old (best-effort — new photo is already safe)
  if (oldPhotoUrl) {
    const deleteResult = await deleteWeightPhoto(oldPhotoUrl);
    if (deleteResult.error) {
      // Log but don't fail — new photo is already uploaded.
      console.warn("[storage] old photo cleanup failed:", deleteResult.error);
    }
  }

  return uploadResult;
}
