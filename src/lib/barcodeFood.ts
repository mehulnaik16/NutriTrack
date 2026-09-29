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

export async function lookupBarcode(
  barcode: string,
): Promise<IFCTItem | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return parseBarcodeProduct(data, barcode);
}
