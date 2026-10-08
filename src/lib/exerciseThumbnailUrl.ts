import { getExerciseThumbnail } from "@/lib/exerciseImages";
import { isNativeApp } from "@/lib/platform";

// The same files as public/exercises, emitted by the build under content-hashed
// names in /assets, which Vercel serves as cached for a year. A changed image
// gets a new name, so nobody is ever shown an old copy.
const HASHED = import.meta.glob<string>(
  "../../public/exercises/*.{jpg,jpeg,png,webp}",
  { eager: true, query: "?url", import: "default" },
);

/**
 * Thumbnail URL for an exercise, or null. Web only: the native app keeps the
 * plain /exercises/ path (its caching is handled separately, later).
 */
export function exerciseThumbnailUrl(name: string): string | null {
  const path = getExerciseThumbnail(name);
  if (!path || isNativeApp()) return path;
  return HASHED[`../../public${path}`] ?? path;
}
