// Run: node src/hooks/use-back-close.test.ts
// Regression test for the overlay back-button helper. The bug it guards: a
// dialog that opens as another closes (barcode scan -> quantity card) read the
// closing dialog's own history.back() as the user pressing back, and shut.
import assert from "node:assert";

// A browser-like history: back() lands later, as a real browser's does.
let backDelay = 0;
class FakeWindow extends EventTarget {
  entries: unknown[] = [{ page: true }];
  idx = 0;
  history = {
    get state() {
      return win.entries[win.idx];
    },
    pushState: (state: unknown) => {
      win.entries = win.entries.slice(0, win.idx + 1);
      win.entries.push(state);
      win.idx++;
    },
    back: () => {
      setTimeout(() => {
        if (win.idx > 0) win.idx--;
        win.dispatchEvent(new Event("popstate"));
      }, backDelay);
    },
  };
}
const win = new FakeWindow();
(globalThis as { window?: unknown }).window = win;
const { holdOverlayEntry } = await import("./use-back-close.ts");

const settle = () => new Promise((r) => setTimeout(r, 60));
const onTop = () =>
  (win.history.state as { __overlay?: string } | undefined)?.__overlay ?? null;

/** Open an overlay; returns its close counter and the cleanup (= closed from the UI). */
function open() {
  const o = { closes: 0, cleanup: () => {} };
  o.cleanup = holdOverlayEntry(() => o.closes++);
  return o;
}

// 1. One overlay: it takes one entry, and closing it from the UI gives it back.
{
  const a = open();
  await settle();
  assert.strictEqual(win.entries.length, 2, "opening pushes one entry");
  a.cleanup();
  await settle();
  assert.strictEqual(win.idx, 0, "closing from the UI drops the entry");
  assert.strictEqual(a.closes, 0, "and does not call close on itself");
}

// 2. Real back press closes the open overlay.
{
  const a = open();
  await settle();
  win.history.back();
  await settle();
  assert.strictEqual(a.closes, 1, "back closes the overlay");
  a.cleanup();
  await settle();
  assert.strictEqual(win.idx, 0, "and leaves no extra entry");
}

// 3. THE BUG, both timings: one closes and another opens in the same tick.
for (const delay of [0, 25]) {
  backDelay = delay;
  const scan = open();
  await settle();
  scan.cleanup(); // scan dialog closes...
  const qty = open(); // ...as the quantity dialog opens
  await settle();
  assert.strictEqual(
    qty.closes,
    0,
    `new overlay stays open (back delay ${delay}ms)`,
  );
  assert.ok(onTop(), `new overlay owns the top entry (back delay ${delay}ms)`);
  assert.strictEqual(win.idx, 1, `no stray entries (back delay ${delay}ms)`);

  // A real back now closes only the new overlay and stays on the page.
  win.history.back();
  await settle();
  assert.strictEqual(qty.closes, 1, "user back closes the new overlay");
  qty.cleanup();
  await settle();
  assert.strictEqual(win.idx, 0, "back on the page entry, not past it");
}
backDelay = 0;

// 4. Nested: an inner overlay over an outer one. Back closes the inner only.
{
  const outer = open();
  await settle();
  const inner = open();
  await settle();
  win.history.back();
  await settle();
  assert.strictEqual(inner.closes, 1, "back closes the inner overlay");
  assert.strictEqual(outer.closes, 0, "the outer one stays open");
  inner.cleanup();
  outer.cleanup();
  await settle();
  assert.strictEqual(win.idx, 0, "both entries dropped");
}

// 5. Opened and closed before its entry was pushed (StrictMode): no stray entry.
{
  const a = open();
  a.cleanup();
  await settle();
  assert.strictEqual(win.idx, 0, "no entry left behind");
}

console.log(
  "✓ use-back-close: overlays survive each other's back(), back still closes",
);
