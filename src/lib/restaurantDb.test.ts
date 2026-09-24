/**
 * Run: node src/lib/restaurantDb.test.ts
 */
import assert from "node:assert";
import { brandHints, exactBrand, menuMatches } from "./restaurantDb.ts";
import type { IFCTItem } from "./foodDb.ts";

const row = (lang: string, item: string) =>
  ({ code: item, name: `${lang} ${item}`, lang }) as IFCTItem;
const rows = [
  row("Domino's", "Farmhouse Pizza (Regular, Hand Tossed)"),
  row("Domino's", "Garlic Bread"),
  row("Domino's", "Pizza Mania Farmhouse"),
  row("KFC", "Farmhouse Burger"),
];
const brands = ["Domino's", "KFC"];

assert.strictEqual(exactBrand(brands, "dominos"), "Domino's");
assert.strictEqual(exactBrand(brands, ""), undefined);
assert.deepStrictEqual(brandHints(brands, "dom"), ["Domino's"]);
assert.deepStrictEqual(brandHints(brands, "Domino's"), []);

// Nothing before two letters: the menu is searched, never dumped.
assert.deepStrictEqual(menuMatches(rows, "Domino's", ""), []);
assert.deepStrictEqual(menuMatches(rows, "Domino's", "f"), []);
// Only the named brand, every word, name-start first.
assert.deepStrictEqual(
  menuMatches(rows, "Domino's", "farm").map((r) => r.code),
  ["Farmhouse Pizza (Regular, Hand Tossed)", "Pizza Mania Farmhouse"],
);
assert.deepStrictEqual(
  menuMatches(rows, "Domino's", "farm regular").map((r) => r.code),
  ["Farmhouse Pizza (Regular, Hand Tossed)"],
);
// The brand's own name does not match its every row.
assert.deepStrictEqual(menuMatches(rows, "Domino's", "domino"), []);

console.log("restaurantDb: all checks passed");
