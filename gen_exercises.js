
const fs = require("fs");
const text = fs.readFileSync("exercises.txt", "utf8");
const lines = text.split("\n").map(l => l.trim()).filter(l => l);

const db = {};
let currentCategory = "";

for (const line of lines) {
  if (line.startsWith("*")) {
    const ex = line.replace("*", "").trim();
    if (currentCategory && ex) {
      if (!db[currentCategory]) db[currentCategory] = [];
      db[currentCategory].push(`"${ex}"`);
    }
  } else {
    currentCategory = line.toLowerCase().replace(/ /g, "").replace("&", "");
  }
}

let out = "export const EXERCISES_DB: Record<string, string[]> = {\n";
for (const [cat, exs] of Object.entries(db)) {
  out += `  ${cat}: [\n    ${exs.join(",\n    ")}\n  ],\n`;
}
out += "};\n";

fs.writeFileSync("exercises_out.ts", out);

