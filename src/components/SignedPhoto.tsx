import { useEffect, useState } from "react";
import { getPhotoSrc } from "@/services/storage";

/**
 * Renders a weight progress photo from the private storage bucket.
 * Local previews (blob:/data: URLs for a not-yet-uploaded file) render as-is.
 * `date` is the entry's date; it sets how long the browser keeps the photo.
 */
export function SignedPhoto({
  src,
  date,
  alt,
  className,
}: {
  src: string;
  date?: string;
  alt: string;
  className?: string;
}) {
  const isLocalPreview = src.startsWith("blob:") || src.startsWith("data:");
  const [resolved, setResolved] = useState<string | null>(
    isLocalPreview ? src : null,
  );

  useEffect(() => {
    if (isLocalPreview) {
      setResolved(src);
      return;
    }
    let cancelled = false;
    setResolved(null);
    getPhotoSrc(src, date).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src, date, isLocalPreview]);

  if (!resolved) {
    return <div className={`animate-pulse bg-muted ${className ?? ""}`} />;
  }
  return <img src={resolved} alt={alt} className={className} />;
}
