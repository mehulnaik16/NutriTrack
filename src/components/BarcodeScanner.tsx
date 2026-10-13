/**
 * Continuous barcode scanner — no shutter button.
 *
 * The previous implementation took ONE JPEG screenshot when the user tapped a
 * button and handed the whole frame to ZXing with every format enabled. That
 * fails far more often than it should, for four compounding reasons:
 *
 *   1. One frame, one attempt. A real scanner tries ~7 frames a second and
 *      wins as soon as the user's hand steadies.
 *   2. The whole frame was searched, so the bars occupied a small share of the
 *      pixels. Decoding needs resolution ACROSS the bars above all else.
 *   3. Every symbology was enabled — QR, Aztec, PDF417, Data Matrix — when
 *      retail food is EAN-13/EAN-8/UPC-A/UPC-E.
 *   4. `getScreenshot()` returns JPEG, and JPEG ringing on hard black/white
 *      edges is exactly what smears bar boundaries.
 *
 * This version decodes straight from the live video, cropped to the on-screen
 * cut-out, restricted to retail 1D formats, on a throttled loop. It prefers the
 * native BarcodeDetector where the browser has one (Android WebView and Chrome
 * do, and it is far faster than the JS path) and falls back to ZXing elsewhere.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Flashlight, Keyboard } from "lucide-react";

/**
 * The cut-out, as fractions of the video frame. Landscape, because a retail
 * barcode is wide and short — a square QR-style window would waste the pixels
 * that actually carry the bars. Exported so the overlay and the crop maths are
 * driven by one definition and cannot drift apart.
 */
export const ROI = { x: 0.08, y: 0.34, w: 0.84, h: 0.26 } as const;
/** Square window for QR codes: 76% of the 3:4 box's width, centred. */
const QR_ROI = { x: 0.12, y: 0.215, w: 0.76, h: 0.57 } as const;

/** Retail food only. Fewer formats means faster decodes and fewer misreads. */
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
];

/** Decode at most this often. rAF fires 60x/sec; decoding that fast just
 *  pins the CPU and makes the preview stutter, which makes aiming harder. */
const DECODE_INTERVAL_MS = 140;

/** Per-mode settings. QR carries its own error correction, so one read is
 *  trusted; 1D barcodes need two agreeing reads (see streakRef). */
const MODES = {
  barcode: {
    roi: ROI,
    zxing: FORMATS,
    native: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    reads: 2,
    fallback: "type the number below",
    aim: "Point at the barcode",
    stuck:
      "Still nothing? Move closer, then further — or type the number below.",
  },
  qr: {
    roi: QR_ROI,
    zxing: [BarcodeFormat.QR_CODE],
    native: ["qr_code"],
    reads: 1,
    fallback: "upload a QR picture below",
    aim: "Point at the QR code",
    stuck:
      "Still nothing? Move closer, then further — or upload a picture below.",
  },
} as const;
/** Show the "type it instead" hint after this long without a read. */
const STRUGGLE_AFTER_MS = 8000;

interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

export function BarcodeScanner({
  onDetected,
  onTypeInstead,
  mode = "barcode",
}: {
  onDetected: (code: string) => void;
  onTypeInstead?: () => void;
  mode?: keyof typeof MODES;
}) {
  const cfg = MODES[mode];
  const roi = cfg.roi;
  // Latest callback without restarting the decode loop on every parent render.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const nativeRef = useRef<NativeDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDecodeRef = useRef(0);
  /** Last code seen, and how many times in a row. Two agreeing reads are
   *  required before firing — a single hit on a partly-occluded EAN-13 is not
   *  rare, and a wrong digit means the wrong product logged. */
  const streakRef = useRef<{ code: string; count: number }>({
    code: "",
    count: 0,
  });
  /** Fires exactly once, even if a decode resolves after we have stopped. */
  const doneRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [struggling, setStruggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  /** Webcam unmounted while the app is in the background; remounting asks
   *  for a fresh stream. */
  const [paused, setPaused] = useState(false);

  /** Stop everything. Safe to call repeatedly and from any exit path. */
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── The decode loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || error) return;
    doneRef.current = false;

    // Built once. Constructing a reader per frame is the difference between a
    // smooth preview and a slideshow.
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, cfg.zxing);
    hints.set(DecodeHintType.TRY_HARDER, true);
    readerRef.current = new BrowserMultiFormatReader(hints);

    const Native = (
      window as unknown as {
        BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector;
      }
    ).BarcodeDetector;
    if (Native) {
      try {
        nativeRef.current = new Native({
          formats: [...cfg.native],
        });
      } catch {
        nativeRef.current = null;
      }
    }

    const startedAt = performance.now();

    const hit = (raw: string) => {
      const code = raw.trim();
      if (!code || doneRef.current) return;
      const streak = streakRef.current;
      streak.count = streak.code === code ? streak.count + 1 : 1;
      streak.code = code;
      if (streak.count < cfg.reads) return;

      doneRef.current = true;
      teardown();
      navigator.vibrate?.(40);
      onDetectedRef.current(code);
    };

    const tick = async () => {
      rafRef.current = requestAnimationFrame(tick);
      if (doneRef.current) return;

      const now = performance.now();
      if (now - lastDecodeRef.current < DECODE_INTERVAL_MS) return;
      lastDecodeRef.current = now;

      if (!struggling && now - startedAt > STRUGGLE_AFTER_MS)
        setStruggling(true);

      const video = webcamRef.current?.video;
      // readyState < 2 means there is no frame to read yet.
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      // Crop from the video's INTRINSIC dimensions, never its CSS box. The
      // element is object-cover, so its displayed box is cropped relative to
      // the real frame; using CSS pixels here would decode the wrong region
      // and look exactly like a broken ROI.
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const sx = Math.round(cfg.roi.x * vw);
      const sy = Math.round(cfg.roi.y * vh);
      const sw = Math.round(cfg.roi.w * vw);
      const sh = Math.round(cfg.roi.h * vh);

      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRef.current = canvas;
      }
      if (canvas.width !== sw || canvas.height !== sh) {
        canvas.width = sw;
        canvas.height = sh;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

      try {
        if (nativeRef.current) {
          const found = await nativeRef.current.detect(canvas);
          if (found?.length) {
            hit(found[0].rawValue);
            return;
          }
        }
        const result = readerRef.current?.decodeFromCanvas(canvas);
        if (result?.getText()) hit(result.getText());
      } catch {
        // A frame with no barcode throws NotFoundException. That is the normal
        // case on most frames, not an error worth surfacing.
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [ready, error, struggling, cfg, teardown]);

  // Stop the camera when the tab is backgrounded, and on unmount. A leaked
  // MediaStream keeps the phone's camera light on and drains the battery.
  useEffect(() => {
    const onVisibility = () => {
      // A stopped stream never comes back by itself, which left a frozen
      // preview on return. Restart unless a code was already read.
      if (doneRef.current) return;
      if (document.visibilityState !== "hidden") return setPaused(false);
      teardown();
      setReady(false);
      setTorchOn(false);
      setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      teardown();
    };
  }, [teardown]);

  const handleUserMedia = useCallback(() => {
    setReady(true);
    const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.() as
      (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    if (caps?.torch) setTorchAvailable(true);
    // Continuous autofocus where supported. Wrapped, because an unsupported
    // advanced constraint rejects and must not take the stream down with it.
    track
      .applyConstraints({
        advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
      })
      .catch(() => {});
  }, []);

  const handleUserMediaError = useCallback(
    (e: string | DOMException) => {
      const name = typeof e === "string" ? e : e.name;
      setError(
        name === "NotAllowedError"
          ? `Camera access is off. Turn it on in your browser settings, or ${cfg.fallback}.`
          : name === "NotFoundError"
            ? `No camera found on this device. ${cfg.fallback[0].toUpperCase()}${cfg.fallback.slice(1)} instead.`
            : `Could not start the camera. ${cfg.fallback[0].toUpperCase()}${cfg.fallback.slice(1)} instead.`,
      );
    },
    [cfg],
  );

  const toggleTorch = useCallback(async () => {
    const stream = webcamRef.current?.video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  if (error) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-border bg-muted/40 p-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        {onTypeInstead && (
          <button
            onClick={onTypeInstead}
            className="flex items-center gap-2 text-sm font-semibold text-accent"
          >
            <Keyboard className="h-4 w-4" /> Enter it manually
          </button>
        )}
      </div>
    );
  }

  const pct = (n: number) => `${n * 100}%`;

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 border-border bg-black">
      {!paused && (
        <Webcam
          audio={false}
          ref={webcamRef}
          className="h-full w-full object-cover"
          // A 640x480 frame cropped to the cut-out often lacks the resolution to
          // resolve the narrow bars; ask for 1280x720 and let the device downscale.
          videoConstraints={{
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }}
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
        />
      )}

      {/* Scrim: four panels around the cut-out, so the window itself stays
          fully clear. pointer-events-none throughout — nothing here is a
          control, and it must not swallow taps meant for the buttons. */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-x-0 top-0 bg-black/60"
          style={{ height: pct(roi.y) }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-black/60"
          style={{ height: pct(1 - roi.y - roi.h) }}
        />
        <div
          className="absolute left-0 bg-black/60"
          style={{ top: pct(roi.y), height: pct(roi.h), width: pct(roi.x) }}
        />
        <div
          className="absolute right-0 bg-black/60"
          style={{
            top: pct(roi.y),
            height: pct(roi.h),
            width: pct(1 - roi.x - roi.w),
          }}
        />

        {/* The window: corner brackets plus a sweeping line. */}
        <div
          className="absolute"
          style={{
            left: pct(roi.x),
            top: pct(roi.y),
            width: pct(roi.w),
            height: pct(roi.h),
          }}
        >
          <span className="absolute -left-px -top-px h-6 w-6 rounded-tl-lg border-l-4 border-t-4 border-accent" />
          <span className="absolute -right-px -top-px h-6 w-6 rounded-tr-lg border-r-4 border-t-4 border-accent" />
          <span className="absolute -bottom-px -left-px h-6 w-6 rounded-bl-lg border-b-4 border-l-4 border-accent" />
          <span className="absolute -bottom-px -right-px h-6 w-6 rounded-br-lg border-b-4 border-r-4 border-accent" />
          <span className="scanline absolute inset-x-2 h-0.5 bg-accent/90 shadow-[0_0_12px_2px_var(--accent)]" />
        </div>

        <p
          className="absolute inset-x-0 text-center text-sm font-semibold text-white drop-shadow"
          style={{ top: `calc(${pct(roi.y + roi.h)} + 1rem)` }}
        >
          {/* Fixed text: a per-frame "Reading…" toggle flickered 7x a second. */}
          {cfg.aim}
        </p>
        {struggling && (
          <p
            className="absolute inset-x-0 px-6 text-center text-xs text-white/70"
            style={{ top: `calc(${pct(roi.y + roi.h)} + 2.6rem)` }}
          >
            {cfg.stuck}
          </p>
        )}
      </div>

      {torchAvailable && (
        <button
          onClick={toggleTorch}
          aria-label={torchOn ? "Turn off torch" : "Turn on torch"}
          aria-pressed={torchOn}
          className={`absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
            torchOn
              ? "border-accent bg-accent text-accent-foreground"
              : "border-white/30 bg-black/50 text-white"
          }`}
        >
          <Flashlight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
