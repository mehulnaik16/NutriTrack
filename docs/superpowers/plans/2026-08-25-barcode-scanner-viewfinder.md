# Barcode Scanner Viewfinder Plan

> **STATUS: IMPLEMENTED, 2026-08-26.**
> Shipped as `src/components/BarcodeScanner.tsx`, replacing the snapshot path
> in `FoodSearch.tsx` (`captureBarcodePhoto` and its shutter button are gone).
> Detection is automatic — there is no button to press. The scanline keyframes
> live in `src/styles.css`.
>
> Not done, and deliberately so: Task 4 Step 4 (verifying camera permission in
> the Capacitor Android shell) cannot be checked yet — `npx cap add android`
> has never been run, so there is no `android/` directory and no manifest to
> declare `android.permission.CAMERA` in. This must be re-tested once the
> native shell is generated; a scanner that works in Chrome and silently fails
> in the shipped app is the expected failure mode if the WebView permission
> bridge is not wired.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the barcode lookup dialog so it scans the way the PhonePe / GPay scanners do — a dark scrim over the live camera with a bright cut-out window, continuous automatic detection with no shutter button, and decoding restricted to the window rather than the whole frame. That last part is the actual "focus point change by reducing the size of the camera" in the request: the decoder stops chewing on the full frame and only reads the small region the user has been told to aim with.

**Architecture:** The current implementation in `src/components/FoodSearch.tsx` is snapshot-based: a full-bleed `react-webcam` in a `min-h-[250px]` box (line ~1653), a shutter button, and `captureBarcodePhoto()` (line 554) which takes a JPEG screenshot and hands it to `BrowserMultiFormatReader.decodeFromImageUrl()`. One frame, one attempt, whole image, then a failure toast. The replacement extracts all of this into a dedicated `src/components/BarcodeScanner.tsx` so `FoodSearch.tsx` (already 1711 lines) does not grow, and drives a `requestAnimationFrame` loop that crops the video's region-of-interest into an offscreen canvas and decodes only that. Decoding prefers the native `BarcodeDetector` API when the browser exposes it — which Android WebView and Chrome do, and which is dramatically faster than the ZXing WASM-free JS path — and falls back to `@zxing/browser`'s `BrowserMultiFormatReader.decodeFromCanvas()` everywhere else. The existing manual-entry input and `lookupBarcode()` Open Food Facts call are kept exactly as they are; only the acquisition of the digits changes.

**Tech Stack:** React 19, `react-webcam` (already a dependency), `@zxing/browser` + `@zxing/library` (already dependencies), the native `BarcodeDetector` Web API where available, Tailwind v4 for the overlay, Radix `Dialog` (`@/components/ui/dialog`).

**Spec:** This document. Source requirement: "BAR CODE SCANNER FOCUS POINT CHANGE BY REDUCING THE SIZE OF THE CAMERA (KEEP PHONEPAY OR GPAY SCANNER REFERENCE)".

## Global Constraints

- `lookupBarcode()` (`FoodSearch.tsx:155`) and `handleBarcode()` (line 580) must not change — the new component's only output is a barcode string, delivered through one `onDetected(code: string)` callback.
- The manual-entry fallback (`Or enter manually` input + "Look up product" button) stays. Cameras get denied, and a keyboard always works.
- The scanner must **stop the camera track on every exit path** — dialog close, successful detect, unmount, and tab backgrounding. A leaked `MediaStream` keeps the phone's camera light on and drains battery; this is the single most common bug in this kind of component.
- Restrict decoding to 1D retail formats (`EAN_13`, `EAN_8`, `UPC_A`, `UPC_E`, `CODE_128`). Leaving all formats enabled makes ZXing slower and materially raises the false-positive rate on packaging artwork.
- No new dependency. Everything needed is already in `package.json`.
- The overlay must not assume a light background — this app is dark-themed (`backgroundColor: "#101014"` in `capacitor.config.ts`), and the scrim is drawn over live video regardless.
- Never auto-submit a detected code without user-visible confirmation of what was read: show the digits and the product name from the lookup before the item is added, exactly as the current flow does via `setSelected(item)`.

---

## Task 1: Extract the scanner into its own component

**Files:**
- Create: `src/components/BarcodeScanner.tsx`
- Modify: `src/components/FoodSearch.tsx`

**Interfaces:**
- Produces: `<BarcodeScanner open onClose onDetected />` where `onDetected(code: string) => void`.
- Modifies: `FoodSearch.tsx` — removes `barcodeWebcamRef`, `scanningBarcode`, and `captureBarcodePhoto()`; the barcode `Dialog` body's camera half is replaced by the new component; `barcodeMode`, `barcodeVal`, `handleBarcode`, and `lookupBarcode` all stay.

- [ ] **Step 1: Create the component shell** with the props above, rendering `react-webcam` with `videoConstraints: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }`. The higher ideal resolution matters: a 640×480 frame cropped to a small ROI often does not have enough pixels across the bars to decode.

- [ ] **Step 2: Move the camera half of the existing dialog into it** and have `FoodSearch.tsx` render `<BarcodeScanner open={barcodeMode} onClose={...} onDetected={(code) => { setBarcodeVal(code); handleBarcode(code); }} />` inside the existing `Dialog`, above the "Or enter manually" divider.

- [ ] **Step 3: Delete the now-dead code** from `FoodSearch.tsx`: `captureBarcodePhoto`, `barcodeWebcamRef`, `scanningBarcode`, and the `BrowserMultiFormatReader` import if nothing else uses it.

**Verification:**
- [ ] The dialog still opens, the camera still shows, and manual entry still looks up a product. (Detection is wired in Task 3.)

---

## Task 2: The PhonePe/GPay-style viewfinder overlay

**Files:**
- Modify: `src/components/BarcodeScanner.tsx`

**Interfaces:**
- Produces: an exported `ROI` constant — the cut-out's position and size as fractions of the video frame — which Task 3's crop maths consumes. One source of truth, so what the user sees framed is exactly what gets decoded.

- [ ] **Step 1: Define the ROI as fractions,** not pixels: a landscape rectangle, roughly `{ x: 0.1, y: 0.3, w: 0.8, h: 0.28 }`. Landscape because retail barcodes are wide and short — a square window (the QR-scanner shape) wastes the pixels that actually carry the bars.

- [ ] **Step 2: Draw the scrim with a cut-out.** Four absolutely-positioned `bg-black/60` panels around the ROI, or a single overlay using `clip-path`. The four-panel approach is simpler to reason about and has no browser-support caveats.

- [ ] **Step 3: Add the corner brackets** — four L-shaped accent-coloured borders at the ROI corners, matching the app's `border-accent` token, exactly the affordance both PhonePe and GPay use to say "put it here".

- [ ] **Step 4: Add the animated scan line** — a thin accent gradient bar sweeping top-to-bottom inside the ROI on a ~2 s loop, via a Tailwind keyframe. Respect `prefers-reduced-motion` by holding it static.

- [ ] **Step 5: Add the caption and state text** below the cut-out: "Point at the barcode" while idle, "Reading…" while a decode is in flight, and a distinct line after ~8 seconds without a hit: "Still nothing? Enter the number below." That timeout hint is what stops the user standing there indefinitely.

- [ ] **Step 6: Make the camera box taller than it currently is** (`min-h-[250px]` → roughly `aspect-[3/4]` with a max height), because the ROI now occupies only a band of it and the surrounding context is what makes the framing readable.

**Verification:**
- [ ] The cut-out, brackets, and scan line render correctly on a narrow mobile viewport with no horizontal overflow.
- [ ] The overlay never intercepts the pointer events it should not — add `pointer-events-none` to the scrim panels.

---

## Task 3: Continuous cropped decoding

**Files:**
- Modify: `src/components/BarcodeScanner.tsx`

**Interfaces:**
- Produces: an internal `decodeFrame()` and a `useEffect`-managed rAF loop; `onDetected` fires exactly once per scanner session.

- [ ] **Step 1: Build the crop.** On each tick, read the `<video>` element from the webcam ref, compute the ROI in real pixels from `videoWidth`/`videoHeight` × the `ROI` fractions, and `ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)` into an offscreen canvas sized to the ROI. **Take the crop from the video element's intrinsic dimensions, not its CSS box** — the element is `object-cover`, so its displayed box is cropped relative to the real frame and using CSS pixels here would decode the wrong region. If the CSS box and the frame have different aspect ratios, compensate for the `object-cover` letterbox before applying the fractions.

- [ ] **Step 2: Decode with the native API first.** Feature-detect `window.BarcodeDetector`; if present, construct it once with the allowed `formats` list and call `detector.detect(canvas)`. This is the fast path and the one Android WebView takes.

- [ ] **Step 3: Fall back to ZXing.** Construct one `BrowserMultiFormatReader` with `DecodeHintType.POSSIBLE_FORMATS` set to the same list and `TRY_HARDER` enabled, and call `decodeFromCanvas(canvas)`. Construct the reader **once** outside the loop — building it per frame is the difference between a smooth preview and a slideshow.

- [ ] **Step 4: Throttle the loop.** Decode at most every ~150 ms even though rAF fires at 60 fps; between decodes just yield. Full-rate decoding pins the CPU and makes the preview stutter, which makes framing harder, which makes detection worse.

- [ ] **Step 5: Require confirmation before firing.** Only call `onDetected` after the **same** code is read on two consecutive successful decodes. A single ZXing hit on a partially-occluded EAN-13 is not rare, and a wrong digit means a wrong product logged.

- [ ] **Step 6: Fire once and stop.** On confirmation, cancel the rAF loop, stop every track on the stream, give haptic feedback via `navigator.vibrate?.(40)`, and call `onDetected`. Guard with a ref so a late-resolving decode cannot fire it twice.

- [ ] **Step 7: Clean up on every exit.** In the effect's teardown: cancel rAF, stop all tracks, null the reader. Also stop when `document.visibilityState` goes `hidden` and restart when it returns.

**Verification:**
- [ ] Pointing at a real packaged product's barcode auto-detects within a couple of seconds with no button press.
- [ ] Holding a barcode **outside** the cut-out does *not* detect — this is the direct proof that the ROI crop is working rather than the whole frame being decoded.
- [ ] Closing the dialog turns the phone's camera indicator off immediately.

---

## Task 4: Torch, permissions, and failure states

**Files:**
- Modify: `src/components/BarcodeScanner.tsx`

- [ ] **Step 1: Add a torch toggle.** Read the video track's `getCapabilities()`; if it reports `torch`, render a flashlight button that calls `applyConstraints({ advanced: [{ torch: on }] })`. Hide the button entirely when unsupported — a dead control is worse than no control. Barcode scanning in a dim kitchen is the common case, so this earns its place.

- [ ] **Step 2: Request continuous autofocus** where supported: include `{ advanced: [{ focusMode: "continuous" }] }` in the constraints, wrapped so an unsupported constraint does not reject the whole `getUserMedia` call.

- [ ] **Step 3: Handle permission denial explicitly.** `react-webcam`'s `onUserMediaError` should switch the component to a message — "Camera access is off. Turn it on in your browser settings, or type the number below." — instead of showing a black box. Distinguish `NotAllowedError` (denied) from `NotFoundError` (no camera) in the wording.

- [ ] **Step 4: Verify behaviour inside the Capacitor Android shell.** The app ships as a WebView loading a remote origin (`capacitor.config.ts`), so camera permission is governed by both the Android manifest and the WebView's permission-request bridge. Confirm `android.permission.CAMERA` is declared and that the WebView grants the request; a scanner that works in Chrome and silently fails in the shipped app is the expected failure here if it is not.

**Verification:**
- [ ] Denying camera permission shows the explanatory message and the manual input still works.
- [ ] The torch button appears on a device that supports it and actually lights the LED.
- [ ] Scanning works inside the Android build, not just in the desktop browser.
