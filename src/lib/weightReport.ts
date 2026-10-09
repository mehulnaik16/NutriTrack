/**
 * The weight report PDF (Settings → Data export), built in the browser.
 *
 * One block per weight entry, newest first:
 *   Date : 8 Oct 2026                                   70 kg
 *   Note: …            (only when there is one)
 *   [photo]            (only when there is one)
 * A block never splits across pages. Photos come through getPhotoSrc, so ones
 * already in the browser's photo cache are not downloaded again, and are
 * re-encoded small (JPEG, ≤ 1000 px) to keep the file a few MB.
 *
 * jsPDF is imported on demand: only someone exporting pays for it.
 *
 * ponytail: built-in Helvetica only draws Latin text, so a note typed in
 * Kannada/Hindi comes out garbled. Embed a Noto font (≈300 KB, loaded only for
 * the export) when users start writing notes in Indian scripts.
 */
import { kgToWeight, round1, type WeightUnit } from "@/lib/units";

export interface ReportEntry {
  date: string; // YYYY-MM-DD
  weight_kg: number;
  note: string | null;
  photo_url: string | null;
}

// A4 portrait, millimetres.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const PHOTO_MAX_W = 100;
const PHOTO_MAX_H = 100;
const PHOTO_PX = 1000;

/** Newest first; entries with no date keep their relative order at the end. */
export function reportOrder<T extends { date: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}

/** Largest size with the photo's aspect ratio that fits inside max × max. */
export function fitBox(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const s = Math.min(maxW / w, maxH / h);
  return { w: w * s, h: h * s };
}

/** "2026-10-08" → "8 Oct 2026", without timezone drift. */
export function reportDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * Load a stored photo as a JPEG data URL, or null if it can't be read. `mark`
 * is drawn into the picture: `left` / `right` in the top corners (the
 * before/after page's date and weight), `bottomRight` in that corner (a single
 * photo's download).
 */
async function photoJpeg(
  photoUrl: string,
  date: string,
  mark?: { left?: string; right?: string; bottomRight?: string },
  maxPx = PHOTO_PX,
  quality = 0.75,
): Promise<{ data: string; w: number; h: number } | null> {
  // Loaded here, not at the top, so the layout helpers stay testable in Node.
  const { getPhotoSrc } = await import("@/services/storage");
  const src = await getPhotoSrc(photoUrl, date);
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const scale = Math.min(
    1,
    maxPx / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (mark) {
    // Light watermark: soft white text with a shadow, readable on any photo.
    // Sized by height: both photos are drawn at the same height on the page.
    const pad = Math.round(canvas.height * 0.03);
    ctx.font = `600 ${Math.round(canvas.height * 0.038)}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = Math.round(canvas.height * 0.009);
    ctx.textAlign = "left";
    if (mark.left) ctx.fillText(mark.left, pad, pad);
    ctx.textAlign = "right";
    if (mark.right) ctx.fillText(mark.right, canvas.width - pad, pad);
    if (mark.bottomRight) {
      ctx.textBaseline = "bottom";
      ctx.fillText(mark.bottomRight, canvas.width - pad, canvas.height - pad);
    }
  }
  return {
    data: canvas.toDataURL("image/jpeg", quality),
    w: canvas.width,
    h: canvas.height,
  };
}

/** One progress photo as a JPEG file with its date in the bottom-right corner. */
export async function weightPhotoFile(
  photoUrl: string,
  date: string,
): Promise<Blob | null> {
  const shot = await photoJpeg(
    photoUrl,
    date,
    { bottomRight: reportDate(date) },
    2000,
    0.9,
  );
  return shot ? (await fetch(shot.data)).blob() : null;
}

export async function buildWeightReport(
  entries: ReportEntry[],
  unit: WeightUnit,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("Weight log", MARGIN, y + 6);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  doc.text(`Exported ${reportDate(todayIso)} · Dombelz`, MARGIN, y + 12);
  doc.setTextColor(0);
  y += 20;

  for (const e of reportOrder(entries)) {
    const photo = e.photo_url ? await photoJpeg(e.photo_url, e.date) : null;
    doc.setFontSize(10);
    const note = e.note?.trim();
    const noteLines: string[] = note
      ? doc.splitTextToSize(`Note: ${note}`, CONTENT_W)
      : [];
    const box = photo
      ? fitBox(photo.w, photo.h, PHOTO_MAX_W, PHOTO_MAX_H)
      : { w: 0, h: 0 };
    const missing = e.photo_url && !photo;
    const blockH =
      8 +
      noteLines.length * 5 +
      (photo ? box.h + 4 : 0) +
      (missing ? 6 : 0) +
      6;

    if (y + blockH > PAGE_H - MARGIN && y > MARGIN + 20) {
      doc.addPage();
      y = MARGIN;
    }

    doc.setFont("helvetica", "normal").setFontSize(11);
    doc.text(`Date : ${reportDate(e.date)}`, MARGIN, y + 5);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${round1(kgToWeight(e.weight_kg, unit))} ${unit}`,
      PAGE_W - MARGIN,
      y + 5,
      { align: "right" },
    );
    y += 8;

    doc.setFont("helvetica", "normal").setFontSize(10);
    if (noteLines.length) {
      doc.text(noteLines, MARGIN, y + 4);
      y += noteLines.length * 5;
    }
    if (photo) {
      doc.addImage(
        photo.data,
        "JPEG",
        MARGIN + (CONTENT_W - box.w) / 2,
        y + 2,
        box.w,
        box.h,
      );
      y += box.h + 4;
    } else if (missing) {
      doc.setTextColor(140).text("(photo could not be loaded)", MARGIN, y + 4);
      doc.setTextColor(0);
      y += 6;
    }

    doc.setDrawColor(220).line(MARGIN, y + 3, PAGE_W - MARGIN, y + 3);
    y += 6;
  }

  await addBeforeAfter(doc, entries, unit);
  return doc.output("blob");
}

/** The oldest and newest photo entries, or null with fewer than two photos. */
export function beforeAfter<
  T extends { date: string; photo_url: string | null },
>(entries: T[]): { before: T; after: T } | null {
  const shots = reportOrder(entries.filter((e) => e.photo_url));
  return shots.length >= 2
    ? { before: shots[shots.length - 1], after: shots[0] }
    : null;
}

/**
 * Last page, landscape so both photos show large: oldest photo ("Before")
 * beside the newest ("After"), each marked with its date and weight.
 */
async function addBeforeAfter(
  doc: import("jspdf").jsPDF,
  entries: ReportEntry[],
  unit: WeightUnit,
): Promise<void> {
  const pair = beforeAfter(entries);
  if (!pair) return;
  const shots = await Promise.all(
    [pair.before, pair.after].map((e) =>
      photoJpeg(e.photo_url!, e.date, {
        left: reportDate(e.date),
        right: `${round1(kgToWeight(e.weight_kg, unit))} ${unit}`,
      }),
    ),
  );
  if (!shots[0] || !shots[1]) return;

  doc.addPage("a4", "landscape");
  const W = PAGE_H; // landscape: the page's sides swap
  const H = PAGE_W;
  const gap = 10;
  const colW = (W - 2 * MARGIN - gap) / 2;
  const top = MARGIN + 14;
  const maxH = H - top - MARGIN;
  // Same height for both, so a differently cropped photo doesn't look bigger.
  const h = Math.min(
    ...shots.map((shot) => fitBox(shot!.w, shot!.h, colW, maxH).h),
  );
  ["Before", "After"].forEach((label, i) => {
    const shot = shots[i]!;
    const box = { w: (shot.w * h) / shot.h, h };
    const colX = MARGIN + i * (colW + gap);
    doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(0);
    doc.text(label, colX + colW / 2, MARGIN + 8, { align: "center" });
    doc.addImage(
      shot.data,
      "JPEG",
      colX + (colW - box.w) / 2,
      top,
      box.w,
      box.h,
    );
  });
}
