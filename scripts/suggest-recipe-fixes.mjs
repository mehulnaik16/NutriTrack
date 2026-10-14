/**
 * Adds suggested corrected macros beside each row of docs/data/recipe-audit.csv
 * for a human to verify. Nothing here writes to the food database.
 *
 * Three methods, named in the `method` column so every number can be traced:
 *
 * - remove_excess_oil (calculated): the row counted all the frying oil as
 *   eaten. Pure fat is taken out of the row until fat equals a typical share
 *   for that kind of dish; protein, carbs and fibre are the row's own,
 *   re-expressed per 100 g of what is left. The only assumption is the target
 *   fat %, which is in the `assumed` column.
 * - ifct_measured: a measured IFCT 2017 row for the same food exists, copied.
 * - scale_dilution (AI estimate): the row looks diluted by cooking water. All
 *   macros are scaled by one factor so energy reaches a typical value for the
 *   dish. That typical kcal is an estimate and must be checked against a
 *   source.
 * - looks_ok: flagged by a broad rule but plausible; suggested `keep`.
 *
 * Run: node scripts/suggest-recipe-fixes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Typical fat, g per 100 g as eaten, by dish kind. First match wins. */
const FAT_TARGETS = [
  [/raita/i, 4],
  [/soup/i, 3],
  [/chaat|bhel/i, 8],
  [
    /kofta|korma|curry|gravy|dum aloo|sabzi|pulao|manchurian|sweet and sour|chaman|lababdar|makhana|tomato fish|paneer(?!.*(pakora|samosa|cutlet|patties|toast))/i,
    10,
  ],
  // Before the dry snacks, so "fish and chips" is not read as chips.
  [
    /cutlet|tikki|kebab|patties|burger|roll|chops|scotch egg|finger|orly|aigrettes|fried fish/i,
    12,
  ],
  [/mathri|namak paras|papdi|murukku|chips|sev|muthia/i, 30],
  [/gujiya|gunjia|ghujia|lavang/i, 22],
  [/samosa|kachori/i, 18],
  [/toast|cheese balls/i, 15],
];
const DEFAULT_FAT = 15; // batter or dough fried: pakora, vada, bonda, poori, bhatura

export const targetFat = (name) =>
  (FAT_TARGETS.find(([re]) => re.test(name)) ?? [null, DEFAULT_FAT])[1];

/** Atwater, as IFCT counts it: 4 protein, 4 carbs, 9 fat, 2 fibre. */
const kcalOf = (m) => 4 * m.p + 4 * m.c + 9 * m.f + 2 * m.fib;

/**
 * Takes X g of pure fat out of 100 g so fat lands on `t` g/100 g:
 * (F - X) / (100 - X) = t / 100  =>  X = (F - t) / (1 - t / 100).
 */
export function removeExcessOil(row, t) {
  const F = row.fatce;
  if (F <= t) return null;
  const X = (F - t) / (1 - t / 100);
  const k = 100 / (100 - X);
  const m = {
    p: row.protcnt * k,
    f: t,
    c: row.choavldf * k,
    fib: (row.fibtg ?? 0) * k,
  };
  return { ...m, kcal: kcalOf(m), oil_removed_g: X };
}

/** Rows the oil fix does not cover, decided one by one. */
const MANUAL = {
  ASC056: { method: "ifct_measured", from: "M004" }, // Egg, poultry, whole, boiled
  ASC197: { method: "looks_ok" },
  ASC223: { method: "looks_ok" },
  ASC230: { method: "looks_ok" },
  BFP218: { method: "looks_ok" },
  BFP544: { method: "looks_ok" },
  OSR093: { method: "looks_ok" },
  // Typical kcal per 100 g: AI estimates, to be checked against a source.
  ASC215: { method: "scale_dilution", kcal: 140 }, // palak paneer
  ASC221: { method: "scale_dilution", kcal: 230 }, // shahi paneer
  ASC226: { method: "scale_dilution", kcal: 180 }, // kadhai paneer
  ASC228: { method: "scale_dilution", kcal: 150 }, // palak mutton
  ASC231: { method: "scale_dilution", kcal: 170 }, // gushtaba
  ASC256: { method: "scale_dilution", kcal: 200 }, // deviled egg
  ASC381: { method: "scale_dilution", kcal: 230 }, // paneer tikka
  ASC466: { method: "scale_dilution", kcal: 300 }, // spinach burfi
  BFP052: { method: "scale_dilution", kcal: 180 }, // egg bhujia
  BFP194: { method: "scale_dilution", kcal: 190 }, // mutton korma
  BFP198: { method: "scale_dilution", kcal: 200 }, // boti kebab
  BFP199: { method: "scale_dilution", kcal: 220 }, // mutton seekh kebab
  BFP397: { method: "scale_dilution", kcal: 400 }, // danedar burfi
  BFP439: { method: "scale_dilution", kcal: 160 }, // khaman
  BFP560: { method: "scale_dilution", kcal: 350 }, // spinach peanut burfi
  OSR024: { method: "scale_dilution", kcal: 250 }, // shrikhand
  OSR025: { method: "scale_dilution", kcal: 270 }, // rabri
  OSR077: { method: "scale_dilution", kcal: 200 }, // paneer lababdar
  OSR153: { method: "scale_dilution", kcal: 180 }, // soya seekh kebab
};

export function suggest(row, rows) {
  const manual = MANUAL[row.code];
  if (manual?.method === "looks_ok")
    return { method: "looks_ok", note: "plausible; suggest keep" };
  if (manual?.method === "ifct_measured") {
    const s = rows.find((r) => r.code === manual.from);
    const m = { p: s.protcnt, f: s.fatce, c: s.choavldf, fib: s.fibtg ?? 0 };
    return {
      method: "ifct_measured",
      ...m,
      kcal: s.enerc / 4.184,
      assumed: `copied ${s.code} ${s.name}`,
    };
  }
  if (manual?.method === "scale_dilution") {
    const k = (manual.kcal * 4.184) / row.enerc;
    const m = {
      p: row.protcnt * k,
      f: row.fatce * k,
      c: row.choavldf * k,
      fib: (row.fibtg ?? 0) * k,
    };
    return {
      method: "scale_dilution",
      ...m,
      kcal: manual.kcal,
      assumed: `AI estimate ${manual.kcal} kcal, scale x${k.toFixed(2)}`,
    };
  }
  const t = targetFat(row.name);
  const fix = removeExcessOil(row, t);
  if (!fix) return { method: "none", note: "no rule applies; check by hand" };
  // A crisp snack also loses water in the fryer, which this fix cannot see.
  const crisp =
    t === 30 ? "; CRISP SNACK: water loss not modelled, may read low" : "";
  return {
    method: "remove_excess_oil",
    ...fix,
    assumed: `fat ${t} g/100 g, removed ${fix.oil_removed_g.toFixed(0)} g oil${crisp}`,
  };
}

function main() {
  const rows = JSON.parse(readFileSync("src/data/ifct2017.json", "utf8"));
  const path = "docs/data/recipe-audit.csv";
  const [head, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const cols = head.split(",");
  const out = [
    [
      ...cols.slice(0, 8),
      "method",
      "assumed",
      "new_kcal",
      "new_protein",
      "new_fat",
      "new_carbs",
      "new_fibre",
      "decision",
    ].join(","),
  ];
  const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const n = (v) => (v == null ? "" : Number(v).toFixed(1));
  const methods = {};
  for (const line of lines) {
    const cells = line.slice(1, -1).split('","');
    const row = rows.find((r) => r.code === cells[0]);
    const s = suggest(row, rows);
    methods[s.method] = (methods[s.method] ?? 0) + 1;
    out.push(
      [
        ...cells.slice(0, 8),
        s.method,
        s.assumed ?? s.note,
        s.kcal == null ? "" : Math.round(s.kcal),
        n(s.p),
        n(s.f),
        n(s.c),
        n(s.fib),
        cells[cols.indexOf("decision")] ?? "",
      ]
        .map(csv)
        .join(","),
    );
  }
  writeFileSync(path, out.join("\n") + "\n");
  console.log("suggested", methods);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
