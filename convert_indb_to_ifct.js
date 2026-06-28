import fs from 'fs';
import xlsx from 'xlsx';

const KJ_PER_KCAL = 4.184;

console.log("Loading Excel file...");
const workbook = xlsx.readFile('./data/Anuvaad_INDB_2024.11.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

console.log("Parsing Excel data...");
const data = xlsx.utils.sheet_to_json(worksheet);

const newItems = [];

for (const row of data) {
  // Extract fields
  const code = row.food_code;
  const name = row.food_name;
  
  if (!code || !name) continue;
  
  const enerc = row.energy_kj || (row.energy_kcal ? row.energy_kcal * KJ_PER_KCAL : 0);
  const protcnt = row.protein_g || 0;
  const fatce = row.fat_g || 0;
  const choavldf = row.carb_g || 0;
  const fibtg = row.fibre_g || 0;
  
  newItems.push({
    code: code,
    name: name,
    scie: "",
    lang: "",
    grup: row.primarysource || "INDB_2024",
    enerc: enerc,
    protcnt: protcnt,
    fatce: fatce,
    choavldf: choavldf,
    fibtg: fibtg
  });
}

console.log(`Parsed ${newItems.length} items from INDB.`);

console.log("Loading existing IFCT data...");
const ifctPath = './src/data/ifct2017.json';
const existingData = JSON.parse(fs.readFileSync(ifctPath, 'utf8'));

console.log(`Existing IFCT has ${existingData.length} items.`);

// Merge. To avoid exact duplicates, we could check names or codes.
// INDB codes are different (e.g. ASC001). 
// Since they might have the same names (like "Apple"), the search ranking will just return both or the better match.
// Let's just append.
const combined = [...existingData, ...newItems];

console.log(`Writing ${combined.length} items to ${ifctPath}...`);
fs.writeFileSync(ifctPath, JSON.stringify(combined, null, 2));

console.log("Done!");
