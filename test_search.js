import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const ifctData = JSON.parse(fs.readFileSync('./src/data/ifct2017.json', 'utf8'));
const KJ_PER_KCAL = 4.184;
const kcal = (kj) => (kj == null ? 0 : kj / KJ_PER_KCAL);

const EXTRA_FOODS = [
  { code: "E001", name: "Obbattu / Puran Poli (1 piece = 80g)", lang: "", enerc: 320 * KJ_PER_KCAL, protcnt: 7.2, fatce: 10.5, choavldf: 49.3 },
  { code: "E002", name: "Idli and Chutney", lang: "", enerc: 120 * KJ_PER_KCAL, protcnt: 3.5, fatce: 2.1, choavldf: 21.0 },
  { code: "E003", name: "Rice and Sambar", lang: "", enerc: 110 * KJ_PER_KCAL, protcnt: 3.0, fatce: 1.5, choavldf: 20.0 },
  { code: "E004", name: "Idli (1 medium = 50g)", lang: "", enerc: 90 * KJ_PER_KCAL, protcnt: 2.5, fatce: 0.2, choavldf: 19.5 },
  { code: "E005", name: "Dosa (1 medium = 100g)", lang: "", enerc: 160 * KJ_PER_KCAL, protcnt: 3.2, fatce: 3.5, choavldf: 28.0 },
  { code: "E006", name: "Parotta (1 piece = 100g)", lang: "", enerc: 320 * KJ_PER_KCAL, protcnt: 5.5, fatce: 14.5, choavldf: 42.0 },
  { code: "E007", name: "Whole Egg (1 large = 50g)", lang: "", enerc: 143 * KJ_PER_KCAL, protcnt: 12.6, fatce: 9.5, choavldf: 0.7 }
];

const ITEMS = [...ifctData, ...EXTRA_FOODS];

function rank(item, q) {
  const name = item.name.toLowerCase();
  const lang = (item.lang || "").toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(` ${q}`)) return 1;
  if (name.includes(q)) return 2;
  if (lang.includes(q)) return 3;
  return 5;
}

function searchLocal(q) {
  const term = q.trim().toLowerCase();
  const matches = [];
  for (const it of ITEMS) {
    const r = rank(it, term);
    if (r < 5) matches.push({ item: it, r });
  }
  matches.sort((a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name));
  return matches.slice(0, 1).map(m => m.item)[0];
}

async function searchAI(q) {
  const prompt = `You are a nutrition expert. The user is searching for "${q}". 
If this food is missing from a standard database, provide its typical nutritional values per 100g.
Return ONLY a JSON object with a key "items" containing up to 3 matching items, no markdown:
{
  "items": [
    {
      "code": "ai-fallback",
      "name": "string (specific name)",
      "enerc": number (in KJ, multiply kcal by 4.184),
      "protcnt": number (g),
      "fatce": number (g),
      "choavldf": number (g)
    }
  ]
}
Rules for accuracy:
- For cooked/boiled dals/pulses: ~90-110 kcal per 100g (thick consistency).
- For thin dal/soups: ~40-60 kcal per 100g.
- For cooked rice: ~130 kcal per 100g.
- For Roti (standard): ~120 kcal per 40g (one roti).
- NEVER return values as low as 28 kcal for dal unless it is mostly water.
Use accurate values for Indian foods like Idli, Dosa, etc.`;

  const apiKey = process.env.VITE_GROQ_KEY_1;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  if (!res.ok) {
    console.log("AI error", await res.text());
    return null;
  }
  const data = await res.json();
  const content = data.choices[0].message.content;
  const parsed = JSON.parse(content);
  return parsed.items ? parsed.items[0] : null;
}

const FOODS_TO_TEST = [
  "Idli", "Dosa", "Parotta", "Sambar", "Chapati", "Roti", "Naan", "Paneer Butter Masala",
  "Chicken Biryani", "Mutton Curry", "Dal Makhani", "Poha", "Upma", "Vada", "Chole Bhature",
  "Aloo Gobi", "Rajma", "Palak Paneer", "Masala Dosa", "Jeera Rice", "Gulab Jamun", "Rasgulla",
  "Jalebi", "Samosa", "Kachori", "Pav Bhaji", "Pani Puri", "Bhel Puri", "Dhokla", "Khaman",
  "Khandvi", "Thepla", "Undhiyu", "Bisibelebath", "Pongal", "Pulihora", "Curd Rice",
  "Chicken Tikka", "Tandoori Chicken", "Fish Curry", "Prawn Masala", "Egg Curry", "Omelette",
  "Boiled Egg", "Milk", "Banana", "Apple", "Orange", "Almonds", "Cashews"
];

async function run() {
  let markdown = "# Food Search AI Accuracy Test (50 items)\n\n";
  markdown += "| Search Query | Source | Matched Name | Calories (kcal) | Protein (g) | Carbs (g) | Fat (g) |\n";
  markdown += "| --- | --- | --- | --- | --- | --- | --- |\n";

  for (const q of FOODS_TO_TEST) {
    let source = "Local DB";
    let match = searchLocal(q);
    
    if (!match) {
      source = "AI (Groq)";
      try {
        console.log("Fetching AI for:", q);
        match = await searchAI(q);
      } catch (e) {
        match = null;
      }
    }
    
    if (match) {
      const cal = kcal(match.enerc).toFixed(1);
      const p = (match.protcnt || 0).toFixed(1);
      const c = (match.choavldf || 0).toFixed(1);
      const f = (match.fatce || 0).toFixed(1);
      markdown += `| ${q} | ${source} | ${match.name} | ${cal} | ${p} | ${c} | ${f} |\n`;
    } else {
      markdown += `| ${q} | Failed | - | - | - | - | - |\n`;
    }
    
    if (source === "AI (Groq)") {
      await new Promise(r => setTimeout(r, 800)); // Rate limit prevention
    }
  }

  // Also write this artifact directly to the antigravity artifacts directory
  const artifactPath = "C:/Users/mehul/.gemini/antigravity-cli/brain/f71dfc10-83ce-4889-962f-29a744e03a92/search_test_results.md";
  fs.writeFileSync(artifactPath, markdown);
  console.log("Done. Results written to", artifactPath);
}

run();
