// Run: node src/lib/barcodeFood.test.ts
import assert from "node:assert";
import { BarcodeLookupError, lookupBarcode } from "./barcodeFood.ts";

const stub = (fn: () => Promise<Response>) => {
  globalThis.fetch = fn as typeof fetch;
};
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const reason = async () => {
  try {
    await lookupBarcode("8901058000290");
  } catch (e) {
    return e instanceof BarcodeLookupError ? e.reason : "other";
  }
  return "none";
};

// Unknown code: v0 answers 200 + status 0 -> null, not an error.
stub(() => json({ status: 0 }));
assert.strictEqual(await lookupBarcode("1"), null);

// Rate limit and server errors are "busy", never "not found".
stub(() => Promise.resolve(new Response("<html>429</html>", { status: 429 })));
assert.strictEqual(await reason(), "busy");
stub(() => json({}, 503));
assert.strictEqual(await reason(), "busy");
// A 200 HTML maintenance page is also the service, not the product.
stub(() => Promise.resolve(new Response("<html>down</html>")));
assert.strictEqual(await reason(), "busy");

// Hung request.
stub(() => Promise.reject(new DOMException("t", "TimeoutError")));
assert.strictEqual(await reason(), "timeout");

// Offline: the network's own error passes through for the generic message.
stub(() => Promise.reject(new TypeError("Failed to fetch")));
assert.strictEqual(await reason(), "other");

// Found but no nutrition: "empty", carrying the name for the toast.
stub(() =>
  json({ status: 1, product: { product_name: "Maggi", nutriments: {} } }),
);
try {
  await lookupBarcode("8901058000290");
  assert.fail("expected empty");
} catch (e) {
  assert(e instanceof BarcodeLookupError && e.reason === "empty");
  assert.strictEqual(e.productName, "Maggi");
}

// Real zero-calorie drinks still log; only missing data is "empty".
stub(() =>
  json({
    status: 1,
    product: { product_name: "Water", nutriments: { "energy-kcal_100g": 0 } },
  }),
);
assert.strictEqual((await lookupBarcode("1"))?.name, "Water");
// Alcohol-only data (beer) counts as nutrition.
stub(() =>
  json({
    status: 1,
    product: { product_name: "Beer", nutriments: { alcohol: 4.8 } },
  }),
);
assert.strictEqual((await lookupBarcode("1"))?.name, "Beer");

console.log("✓ barcodeFood: lookup failures are told apart");
