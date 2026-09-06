/**
 * vercel-prepare.mjs
 *
 * Nitro (3.x) with the "vercel" preset outputs to dist/ in a format
 * designed for `npx vercel deploy --prebuilt`. However, Vercel's Git
 * integration only auto-discovers Build Output API v3 when the files
 * live in .vercel/output/. This script bridges the gap.
 *
 * Mapping:
 *   dist/config.json  →  .vercel/output/config.json
 *   dist/client/      →  .vercel/output/static/
 *   dist/server/      →  .vercel/output/functions/__server.func/
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const out = join(root, ".vercel", "output");

// ── 1. Clean previous output ────────────────────────────────────────
if (existsSync(out)) {
  await rm(out, { recursive: true, force: true });
  console.log("  Cleaned old .vercel/output");
}

// ── 2. Create required directories ──────────────────────────────────
await mkdir(join(out, "static"), { recursive: true });
await mkdir(join(out, "functions", "__server.func"), { recursive: true });
console.log("  Created .vercel/output directories");

// ── 3. Copy routing config, adding cron schedules ────────────────────
//
// Vercel reads cron definitions from the Build Output API config, not from a
// vercel.json — this project has no vercel.json because Nitro generates the
// routing config itself. So the crons are merged in here rather than being a
// separate file that would have to duplicate the routes.
//
// Schedules are UTC. 03:30 UTC is 09:00 IST.
//
// Hobby allows two cron jobs and runs them approximately once per day; the
// digest only needs one, and "approximately 9am" is fine for something a person
// reads over breakfast.
const CRONS = [{ path: "/api/ops-digest", schedule: "30 3 * * *" }];

const config = JSON.parse(await readFile(join(dist, "config.json"), "utf8"));
config.crons = CRONS;
await writeFile(join(out, "config.json"), JSON.stringify(config, null, 2));
console.log(`  Copied config.json (+${CRONS.length} cron)`);

// ── 4. Copy public/static assets ────────────────────────────────────
//   dist/client/ → .vercel/output/static/
//   (preserves the /assets/... sub-path Vercel routes expect)
await cp(join(dist, "client"), join(out, "static"), { recursive: true });
console.log("  Copied static assets (dist/client → .vercel/output/static)");

// ── 5. Copy serverless function ──────────────────────────────────────
//   dist/server/ → .vercel/output/functions/__server.func/
//   (the route "dest":"/__server" maps to this function name)
await cp(join(dist, "server"), join(out, "functions", "__server.func"), {
  recursive: true,
});
console.log(
  "  Copied server function (dist/server → .vercel/output/functions/__server.func)"
);

console.log("\n✓ .vercel/output is ready for Vercel deployment\n");
