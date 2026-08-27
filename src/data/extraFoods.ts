/**
 * Curated prepared-food database (per 100 g / 100 ml).
 *
 * The bundled IFCT 2017 dataset covers mostly raw ingredients; this file
 * fills the gap with cooked dishes, street food, beverages, and packaged
 * staples people actually log. Values are typical figures cross-checked
 * against standard nutrition references.
 *
 * Portion hints used to be embedded in the name ("Roti / Chapati (1 medium =
 * 40g)") so users could convert by hand. Countable foods now carry their piece
 * weight in `PIECE_G` in `lib/foodUnits.ts` and are logged in pieces directly,
 * so those names are plain. Rows that still spell a portion out are ones with
 * no piece weight yet.
 *
 * enerc is stored in kJ (kcal × 4.184) to match the IFCT schema.
 */

export interface ExtraFoodItem {
  code: string;
  name: string;
  scie: string;
  lang: string;
  grup: string;
  enerc: number | null;
  protcnt: number | null;
  fatce: number | null;
  choavldf: number | null;
  fibtg: number | null;
}

const KJ = 4.184;

/** Compact row helper: kcal, protein, fat, carbs, fiber — all per 100 g. */
const f = (
  code: string,
  name: string,
  grup: string,
  kcal: number,
  p: number,
  fat: number,
  c: number,
  fib: number,
): ExtraFoodItem => ({
  // Prefixed because IFCT already uses bare E-codes for fruits — its E004 is an
  // apple, not an idli — and `ITEMS` merges both lists. A shared code makes the
  // two rows indistinguishable to anything that looks a food up by code, which
  // is how piece weights and densities are keyed.
  code: `X${code}`,
  name,
  scie: "",
  lang: "",
  grup,
  enerc: kcal * KJ,
  protcnt: p,
  fatce: fat,
  choavldf: c,
  fibtg: fib,
});

export const EXTRA_FOODS: ExtraFoodItem[] = [
  // ── Original items ──────────────────────────────────────────
  f("E001", "Obbattu / Puran Poli (1 piece = 80g)", "Indian Sweets", 320, 7.2, 10.5, 49.3, 3.5),
  f("E002", "Idli and Chutney", "Combo Meals", 120, 3.5, 2.1, 21.0, 1.5),
  f("E003", "Rice and Sambar", "Combo Meals", 110, 3.0, 1.5, 20.0, 1.2),
  f("E004", "Idli", "Breakfast", 90, 2.5, 0.2, 19.5, 0.8),
  f("E005", "Dosa", "Breakfast", 160, 3.2, 3.5, 28.0, 1.2),
  f("E006", "Parotta (1 piece = 100g)", "Breakfast", 320, 5.5, 14.5, 42.0, 1.5),
  f("E007", "Whole Egg", "Protein", 143, 12.6, 9.5, 0.7, 0),

  // ── Breakfast & tiffin ──────────────────────────────────────
  f("E010", "Poha (cooked)", "Breakfast", 130, 2.6, 3.5, 22, 1.2),
  f("E011", "Upma (cooked)", "Breakfast", 155, 3.5, 5.5, 22, 1.5),
  f("E012", "Vermicelli Upma / Sevai", "Breakfast", 140, 3.0, 4.0, 23, 1.2),
  f("E013", "Masala Dosa", "Breakfast", 180, 3.5, 7.0, 25, 1.5),
  f("E014", "Uttapam (1 = 120g)", "Breakfast", 160, 4.5, 4.5, 25, 1.5),
  f("E015", "Aloo Paratha", "Breakfast", 250, 5.0, 10.0, 34, 2.5),
  f("E016", "Plain Paratha", "Breakfast", 300, 6.0, 12.0, 42, 2.5),
  f("E017", "Besan Chilla (1 = 60g)", "Breakfast", 180, 8.0, 8.0, 18, 3.0),
  f("E018", "Oats Porridge with Milk", "Breakfast", 100, 3.8, 3.0, 14, 1.5),
  f("E019", "Cornflakes with Milk", "Breakfast", 120, 3.5, 2.5, 21, 0.8),
  f("E020", "White Bread (1 slice = 25g)", "Breakfast", 265, 8.0, 3.5, 49, 2.5),
  f("E021", "Brown Bread (1 slice = 28g)", "Breakfast", 250, 9.0, 3.5, 43, 4.0),
  f("E022", "Bread Omelette (1 = 150g)", "Breakfast", 210, 9.5, 10.0, 20, 1.2),
  f("E023", "Medu Vada", "Breakfast", 245, 7.5, 12.0, 27, 2.5),

  // ── Breads ──────────────────────────────────────────────────
  f("E030", "Roti / Chapati", "Breads", 300, 9.0, 7.0, 48, 5.0),
  f("E031", "Naan", "Breads", 310, 9.0, 9.0, 48, 2.0),
  f("E032", "Butter Naan", "Breads", 340, 8.5, 12.0, 47, 2.0),
  f("E033", "Tandoori Roti (1 = 55g)", "Breads", 280, 9.5, 3.5, 54, 4.5),
  f("E034", "Puri", "Breads", 380, 6.5, 18.0, 46, 2.0),
  f("E035", "Bhatura (1 = 90g)", "Breads", 330, 7.5, 14.0, 42, 1.8),

  // ── Rice & grains (cooked) ──────────────────────────────────
  f("E040", "White Rice (cooked)", "Rice & Grains", 130, 2.7, 0.3, 28, 0.4),
  f("E041", "Brown Rice (cooked)", "Rice & Grains", 111, 2.6, 0.9, 23, 1.8),
  f("E042", "Jeera Rice", "Rice & Grains", 165, 3.0, 4.5, 27, 0.6),
  f("E043", "Veg Pulao", "Rice & Grains", 145, 3.0, 4.5, 22, 1.5),
  f("E044", "Veg Biryani", "Rice & Grains", 165, 3.5, 6.0, 23, 1.6),
  f("E045", "Chicken Biryani", "Rice & Grains", 180, 9.0, 7.0, 20, 1.0),
  f("E046", "Curd Rice", "Rice & Grains", 120, 3.5, 3.5, 18, 0.4),
  f("E047", "Khichdi", "Rice & Grains", 120, 4.5, 3.0, 18, 1.5),
  f("E048", "Veg Fried Rice", "Rice & Grains", 165, 3.5, 5.5, 25, 1.2),
  f("E049", "Lemon Rice", "Rice & Grains", 150, 2.8, 5.0, 23, 0.8),
  f("E050", "Quinoa (cooked)", "Rice & Grains", 120, 4.4, 1.9, 21, 2.8),

  // ── Dals & curries ──────────────────────────────────────────
  f("E060", "Dal Tadka (thick)", "Dals & Curries", 105, 5.5, 3.5, 12, 2.5),
  f("E061", "Dal Makhani", "Dals & Curries", 140, 6.0, 6.5, 14, 3.0),
  f("E062", "Chole / Chana Masala", "Dals & Curries", 130, 6.0, 5.0, 15, 4.5),
  f("E063", "Rajma Curry", "Dals & Curries", 115, 5.5, 3.5, 14, 4.5),
  f("E064", "Sambar", "Dals & Curries", 60, 2.8, 1.8, 8, 1.8),
  f("E065", "Palak Paneer", "Dals & Curries", 150, 7.0, 11.0, 5, 2.0),
  f("E066", "Paneer Butter Masala", "Dals & Curries", 210, 8.0, 16.0, 8, 1.5),
  f("E067", "Kadai Paneer", "Dals & Curries", 180, 8.5, 13.0, 7, 2.0),
  f("E068", "Aloo Gobi", "Dals & Curries", 90, 2.5, 4.0, 11, 2.5),
  f("E069", "Bhindi Masala", "Dals & Curries", 95, 2.2, 5.5, 9, 3.2),
  f("E070", "Mixed Veg Curry", "Dals & Curries", 85, 2.5, 4.0, 9, 2.5),
  f("E071", "Butter Chicken", "Dals & Curries", 190, 13.0, 13.0, 5, 0.8),
  f("E072", "Chicken Curry (homestyle)", "Dals & Curries", 145, 14.0, 8.0, 4, 0.8),
  f("E073", "Egg Curry", "Dals & Curries", 130, 8.0, 9.0, 4.5, 0.9),
  f("E074", "Fish Curry", "Dals & Curries", 120, 13.0, 6.0, 4, 0.6),
  f("E075", "Egg Bhurji", "Dals & Curries", 155, 11.0, 11.0, 3, 0.4),

  // ── Protein staples ─────────────────────────────────────────
  f("E080", "Chicken Breast (cooked)", "Protein", 165, 31.0, 3.6, 0, 0),
  f("E081", "Chicken Thigh (cooked)", "Protein", 209, 26.0, 11.0, 0, 0),
  f("E082", "Grilled Fish (100g)", "Protein", 150, 22.0, 6.5, 0.5, 0),
  f("E083", "Paneer (raw)", "Protein", 265, 18.0, 20.0, 3.5, 0),
  f("E084", "Tofu", "Protein", 76, 8.0, 4.8, 1.9, 0.3),
  f("E085", "Egg White (1 = 33g)", "Protein", 52, 11.0, 0.2, 0.7, 0),
  f("E086", "Whey Protein Powder (1 scoop = 30g)", "Protein", 400, 80.0, 5.0, 8, 0),
  f("E087", "Soya Chunks (dry)", "Protein", 345, 52.0, 0.5, 33, 13.0),
  f("E088", "Moong Sprouts (raw)", "Protein", 30, 3.0, 0.1, 6, 1.8),
  f("E089", "Greek Yogurt (plain)", "Protein", 90, 9.0, 4.0, 4.5, 0),
  f("E090", "Tandoori Chicken (1 leg = 100g)", "Protein", 185, 24.0, 9.0, 2, 0.5),

  // ── Snacks & street food ────────────────────────────────────
  f("E100", "Samosa", "Snacks", 308, 5.0, 17.0, 32, 2.5),
  f("E101", "Vada Pav (1 = 130g)", "Snacks", 290, 6.0, 12.0, 39, 2.5),
  f("E102", "Pav Bhaji (1 plate ≈ 300g)", "Snacks", 130, 3.0, 6.0, 16, 2.2),
  f("E103", "Veg Pakora", "Snacks", 315, 7.0, 19.0, 29, 3.0),
  f("E104", "Dhokla", "Snacks", 160, 6.0, 5.0, 22, 1.8),
  f("E105", "Bhel Puri", "Snacks", 170, 4.0, 6.0, 25, 2.2),
  f("E106", "Pani Puri / Gol Gappa", "Snacks", 220, 4.0, 8.0, 32, 1.8),
  f("E107", "Veg Momos (1 = 35g, steamed)", "Snacks", 100, 3.5, 2.5, 16, 1.0),
  f("E108", "Maggi Noodles (cooked, 1 pack ≈ 300g)", "Snacks", 135, 3.0, 5.0, 19, 0.8),
  f("E109", "Roasted Makhana", "Snacks", 350, 9.7, 0.5, 77, 7.6),
  f("E110", "Roasted Chana", "Snacks", 370, 19.0, 5.5, 60, 17.0),
  f("E111", "Roasted Peanuts", "Snacks", 567, 26.0, 49.0, 16, 8.5),
  f("E112", "Almonds (10 pcs ≈ 12g)", "Snacks", 579, 21.0, 50.0, 22, 12.5),
  f("E113", "Peanut Butter (1 tbsp = 16g)", "Snacks", 588, 25.0, 50.0, 20, 6.0),
  f("E114", "Marie Biscuit (1 = 5g)", "Snacks", 450, 7.0, 13.0, 75, 1.5),
  f("E115", "Parle-G Biscuit (1 = 4.5g)", "Snacks", 450, 7.0, 12.0, 77, 1.0),
  f("E116", "Dark Chocolate 70% (2 squares = 20g)", "Snacks", 600, 7.8, 43.0, 46, 11.0),

  // ── Fast food ───────────────────────────────────────────────
  f("E120", "Cheese Pizza (1 slice = 100g)", "Fast Food", 266, 11.0, 10.0, 33, 2.3),
  f("E121", "Veg Burger (1 = 150g)", "Fast Food", 230, 6.0, 9.0, 30, 2.0),
  f("E122", "Chicken Burger (1 = 170g)", "Fast Food", 250, 12.0, 11.0, 26, 1.5),
  f("E123", "French Fries", "Fast Food", 312, 3.4, 15.0, 41, 3.8),
  f("E124", "Veg Frankie / Kathi Roll (1 = 150g)", "Fast Food", 215, 5.5, 8.5, 29, 2.0),
  f("E125", "Chicken Shawarma Roll (1 = 180g)", "Fast Food", 200, 12.0, 8.0, 20, 1.5),

  // ── Sweets ──────────────────────────────────────────────────
  f("E130", "Gulab Jamun", "Indian Sweets", 320, 4.0, 12.0, 48, 0.5),
  f("E131", "Jalebi", "Indian Sweets", 380, 3.0, 15.0, 58, 0.3),
  f("E132", "Rice Kheer", "Indian Sweets", 145, 3.5, 5.0, 21, 0.3),
  f("E133", "Besan Ladoo (1 = 30g)", "Indian Sweets", 450, 10.0, 22.0, 53, 3.0),
  f("E134", "Rasgulla", "Indian Sweets", 186, 4.0, 1.5, 40, 0),
  f("E135", "Vanilla Ice Cream (1 scoop = 65g)", "Indian Sweets", 207, 3.5, 11.0, 24, 0.5),

  // ── Beverages (per 100 ml) ──────────────────────────────────
  f("E140", "Masala Chai (milk + sugar, 1 cup = 150ml)", "Beverages", 60, 1.6, 2.0, 9, 0),
  f("E141", "Chai without Sugar (1 cup = 150ml)", "Beverages", 35, 1.8, 2.0, 2.5, 0),
  f("E142", "Filter Coffee (milk + sugar, 1 cup = 150ml)", "Beverages", 55, 1.5, 1.8, 8, 0),
  f("E143", "Black Coffee (no sugar)", "Beverages", 2, 0.1, 0, 0.4, 0),
  f("E144", "Sweet Lassi (1 glass = 250ml)", "Beverages", 90, 2.5, 2.5, 14, 0),
  f("E145", "Buttermilk / Chaas (1 glass = 250ml)", "Beverages", 25, 1.3, 1.0, 2.5, 0),
  f("E146", "Coconut Water (1 glass = 250ml)", "Beverages", 19, 0.7, 0.2, 3.7, 1.1),
  f("E147", "Orange Juice (1 glass = 250ml)", "Beverages", 45, 0.7, 0.2, 10.4, 0.2),
  f("E148", "Cola / Soft Drink (1 can = 300ml)", "Beverages", 42, 0, 0, 10.6, 0),
  f("E149", "Full Fat Milk (1 glass = 250ml)", "Beverages", 65, 3.2, 4.0, 4.8, 0),
  f("E150", "Toned Milk (1 glass = 250ml)", "Beverages", 50, 3.1, 1.5, 4.7, 0),
  f("E151", "Mango Shake (1 glass = 250ml)", "Beverages", 110, 2.5, 3.0, 18, 0.8),

  // ── Dairy & fats ────────────────────────────────────────────
  f("E160", "Curd / Dahi (full fat)", "Dairy & Fats", 62, 3.1, 3.3, 4.7, 0),
  f("E161", "Ghee (1 tsp = 5g)", "Dairy & Fats", 900, 0, 100.0, 0, 0),
  f("E162", "Butter (1 tsp = 5g)", "Dairy & Fats", 717, 0.9, 81.0, 0.1, 0),
  f("E163", "Cheese Slice (1 = 20g)", "Dairy & Fats", 310, 18.0, 25.0, 3.5, 0),

  // ── Fruits (with piece hints) ───────────────────────────────
  f("E170", "Banana", "Fruits", 89, 1.1, 0.3, 23, 2.6),
  f("E171", "Apple (1 medium = 180g)", "Fruits", 52, 0.3, 0.2, 14, 2.4),
  f("E172", "Mango (1 cup cubes = 165g)", "Fruits", 60, 0.8, 0.4, 15, 1.6),
  f("E173", "Orange (1 = 130g)", "Fruits", 47, 0.9, 0.1, 12, 2.4),
  f("E174", "Papaya (1 cup = 145g)", "Fruits", 43, 0.5, 0.3, 11, 1.7),
  f("E175", "Watermelon (1 cup = 150g)", "Fruits", 30, 0.6, 0.2, 8, 0.4),
  f("E176", "Grapes (1 cup = 150g)", "Fruits", 69, 0.7, 0.2, 18, 0.9),
  f("E177", "Pomegranate (1 cup arils = 175g)", "Fruits", 83, 1.7, 1.2, 19, 4.0),
];
