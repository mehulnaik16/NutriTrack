import { type IFCTItem, KJ_PER_KCAL } from "./foodDb.ts";

/** Ethanol density: 0.789 g/mL at 20°C. */
export const ETHANOL_DENSITY = 0.789;

/** Parse Open Food Facts product payload into an IFCTItem, factoring in alcohol calories. */
export function parseBarcodeProduct(
  data: any,
  barcode: string,
): IFCTItem | null {
  if (data?.status !== 1 || !data?.product) return null;
  const n = data.product.nutriments ?? {};

  // Ethanol density: 0.789 g/mL. OFF reports ABV % or g in alcohol/alcohol_100g.
  const abv = Number(n.alcohol_100g ?? n.alcohol ?? 0) || 0;
  const alcohol = abv > 0 ? +(abv * ETHANOL_DENSITY).toFixed(2) : 0;
  const rawKcal = Number(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0) || 0;
  const baseKcal =
    4 * (n.proteins_100g ?? 0) +
    4 * (n.carbohydrates_100g ?? 0) +
    9 * (n.fat_100g ?? 0);
  const minKcal = baseKcal + 7 * alcohol;
  // Use stated kcal if reliable; otherwise fallback to Atwater floor + alcohol:
  const kcal100g = rawKcal >= minKcal * 0.8 ? rawKcal : minKcal;

  return {
    code: barcode,
    name: data.product.product_name ?? "Unknown product",
    scie: "",
    lang: "",
    grup: alcohol > 0 ? "Beverages" : "Packaged",
    enerc: kcal100g * KJ_PER_KCAL,
    protcnt: n.proteins_100g ?? 0,
    fatce: n.fat_100g ?? 0,
    choavldf: n.carbohydrates_100g ?? 0,
    fibtg: n.fiber_100g ?? 0,
    alcohol,
  };
}

/** Give up on a hung lookup so the button never spins forever. */
export const LOOKUP_TIMEOUT_MS = 10_000;

/** Any of these present means OFF has real nutrition for the product. */
const NUTRITION_KEYS = [
  "energy-kcal_100g",
  "energy-kcal",
  "energy_100g",
  "proteins_100g",
  "carbohydrates_100g",
  "fat_100g",
  "alcohol_100g",
  "alcohol",
];

/**
 * Why a lookup failed, when it is not simply "product unknown" (that is a
 * null result). busy: OFF rate-limited (429), errored (5xx) or sent a non-JSON
 * page. timeout: no answer in LOOKUP_TIMEOUT_MS. empty: the product exists but
 * has no nutrition, which would otherwise log as 0 kcal.
 */
export class BarcodeLookupError extends Error {
  readonly reason: "busy" | "timeout" | "empty";
  readonly productName?: string;
  constructor(reason: BarcodeLookupError["reason"], productName?: string) {
    super(reason);
    this.reason = reason;
    this.productName = productName;
  }
}

const isTimeout = (e: unknown) => (e as Error)?.name === "TimeoutError";

/** Null when OFF does not know the code. Throws BarcodeLookupError, or the
 *  network's own error when offline. */
export async function lookupBarcode(barcode: string): Promise<IFCTItem | null> {
  let data: {
    status?: number;
    product?: { product_name?: string; nutriments?: Record<string, unknown> };
  };
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    // v0 answers an unknown code with 200 + status 0, so a non-OK status is
    // the service failing, not the product missing.
    if (!res.ok) throw new BarcodeLookupError("busy");
    try {
      data = await res.json();
    } catch (e) {
      if (isTimeout(e)) throw e;
      throw new BarcodeLookupError("busy");
    }
  } catch (e) {
    if (isTimeout(e)) throw new BarcodeLookupError("timeout");
    throw e;
  }

  const n = data?.product?.nutriments ?? {};
  if (data?.status === 1 && !NUTRITION_KEYS.some((k) => n[k] != null))
    throw new BarcodeLookupError("empty", data.product?.product_name);
  return parseBarcodeProduct(data, barcode);
}
