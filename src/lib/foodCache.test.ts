/* Runnable self-check for the AI food cache's pure logic. No test framework in
   this repo, so this is a plain assert script — same convention as
   foodUnits.test.ts and ai.test.ts.

   Run:
     node src/lib/foodCache.test.ts

   Everything here is a pure function: no network, no Supabase, no API key. */
import assert from "node:assert";
import { scriptOf, searchKey } from "./foodCache.ts";

// ── script detection ───────────────────────────────────────────────────────
assert.equal(scriptOf("thatte idli"), "Latin");
assert.equal(scriptOf("ತಟ್ಟೆ ಇಡ್ಲಿ"), "Kannada");
assert.equal(scriptOf("मेरा शेक"), "Devanagari");
assert.equal(scriptOf("என் இட்லி"), "Tamil");
// Mixed input takes the first non-Latin script it finds: a romanised word
// beside a native one is still a native-script query.
assert.equal(scriptOf("2 ಇಡ್ಲಿ"), "Kannada");

// ── search key ─────────────────────────────────────────────────────────────
assert.equal(searchKey("Thatte Idli"), "thatte idli");
assert.equal(searchKey("  Curd   Rice!  "), "curd rice");
// The whole point: a native-script name and its romanisation must land close
// enough for pg_trgm to see them as the same food.
const kn = searchKey("ಇಡ್ಲಿ");
assert.ok(kn.startsWith("idl"), `expected an idli-like key, got ${kn}`);
assert.equal(searchKey(""), "");

console.log("foodCache: all assertions passed");
