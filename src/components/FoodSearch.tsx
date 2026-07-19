import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from "react";
import {
  Search,
  Plus,
  Loader2,
  Camera,
  Barcode,
  X,
  ScanLine,
  Mic,
  MicOff,
  PenTool,
  Flame,
  ArrowRight,
  Heart,
  Clock,
  Trash2,
  RotateCcw,
  Layers,
  Sparkles,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Webcam from "react-webcam";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/client";
import { groqVision, groqTranscribe, groqChat } from "@/lib/groq";
import ifctData from "@/data/ifct2017.json";

interface IFCTItem {
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

interface AIFoodResult {
  food_name: string;
  estimated_weight_g: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g?: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

interface VoiceFoodItem {
  food_name: string;
  quantity_g: number;
  unit?: string;
  unit_quantity?: number;
  meal_type: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

const KJ_PER_KCAL = 4.184;

const EXTRA_FOODS: IFCTItem[] = [
  {
    code: "E001",
    name: "Obbattu / Puran Poli (1 piece = 80g)",
    scie: "",
    lang: "",
    grup: "Indian Sweets",
    enerc: 320 * KJ_PER_KCAL,
    protcnt: 7.2,
    fatce: 10.5,
    choavldf: 49.3,
    fibtg: 3.5,
  },
  {
    code: "E002",
    name: "Idli and Chutney",
    scie: "",
    lang: "",
    grup: "Combo Meals",
    enerc: 120 * KJ_PER_KCAL,
    protcnt: 3.5,
    fatce: 2.1,
    choavldf: 21.0,
    fibtg: 1.5,
  },
  {
    code: "E003",
    name: "Rice and Sambar",
    scie: "",
    lang: "",
    grup: "Combo Meals",
    enerc: 110 * KJ_PER_KCAL,
    protcnt: 3.0,
    fatce: 1.5,
    choavldf: 20.0,
    fibtg: 1.2,
  },
  {
    code: "E004",
    name: "Idli (1 medium = 50g)",
    scie: "",
    lang: "",
    grup: "Breakfast",
    enerc: 90 * KJ_PER_KCAL,
    protcnt: 2.5,
    fatce: 0.2,
    choavldf: 19.5,
    fibtg: 0.8,
  },
  {
    code: "E005",
    name: "Dosa (1 medium = 100g)",
    scie: "",
    lang: "",
    grup: "Breakfast",
    enerc: 160 * KJ_PER_KCAL,
    protcnt: 3.2,
    fatce: 3.5,
    choavldf: 28.0,
    fibtg: 1.2,
  },
  {
    code: "E006",
    name: "Parotta (1 piece = 100g)",
    scie: "",
    lang: "",
    grup: "Breakfast",
    enerc: 320 * KJ_PER_KCAL,
    protcnt: 5.5,
    fatce: 14.5,
    choavldf: 42.0,
    fibtg: 1.5,
  },
  {
    code: "E007",
    name: "Whole Egg (1 large = 50g)",
    scie: "",
    lang: "",
    grup: "Protein",
    enerc: 143 * KJ_PER_KCAL,
    protcnt: 12.6,
    fatce: 9.5,
    choavldf: 0.7,
    fibtg: 0,
  },
];

const ITEMS = [...(ifctData as IFCTItem[]), ...EXTRA_FOODS];
const kcal = (kj: number | null) => (kj == null ? 0 : kj / KJ_PER_KCAL);

function rank(item: IFCTItem, q: string): number {
  const name = item.name.toLowerCase();
  const lang = item.lang.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(` ${q}`)) return 1;
  if (name.includes(q)) return 2;
  if (lang.includes(q)) return 3;
  return 5;
}

// ── AI image recognition via Groq Llama 4 Scout vision ───────────────────────
async function recognizeFoodFromImage(
  base64: string,
  mimeType: string,
): Promise<AIFoodResult> {
  const prompt = `You are a nutrition expert. Analyze this food photo and return ONLY valid JSON, no markdown:
{
  "food_name": "specific food name",
  "estimated_weight_g": number,
  "calories_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fat_per_100g": number,
  "fiber_per_100g": number,
  "confidence": "high" or "medium" or "low",
  "notes": "portion sizing assumptions"
}
A human palm is ~18cm — use it as a size reference if visible. Use accurate nutritional values for Indian foods.`;

  const raw = await groqVision({ prompt, base64, mimeType, max_tokens: 400 });
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as AIFoodResult;
}

// ── Voice food logging via Groq Whisper + Llama 4 Scout ──────────────────────
async function parseVoiceFoodLog(
  transcript: string,
  mealType: string,
): Promise<VoiceFoodItem[]> {
  const prompt = `You are a nutrition expert. The user said: "${transcript}"
Parse every food item mentioned and return ONLY a JSON array, no markdown:
[
  {
    "food_name": "string",
    "quantity_g": number,
    "unit": "string (e.g. 'pieces', 'bowls', 'g')",
    "unit_quantity": number,
    "meal_type": "${mealType}",
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "fiber_g": number
  }
]
Rules:
- Use common portion sizes if not specified (1 roti = 40g, 1 bowl dal = 150g, 1 banana = 120g, 1 egg = 50g)
- If user says "2 rotis", set unit="rotis", unit_quantity=2, quantity_g=80. If they just say grams, set unit="g", unit_quantity=100
- Use accurate nutritional values for Indian foods
- Each distinct food is a separate item in the array
- Return empty array [] if no food is mentioned`;

  const raw = await groqChat({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
    temperature: 0.1,
  });
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as VoiceFoodItem[];
}

// ── Barcode lookup via Open Food Facts ───────────────────────────────────────
async function lookupBarcode(barcode: string): Promise<IFCTItem | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1) return null;
  const n = data.product.nutriments;
  return {
    code: barcode,
    name: data.product.product_name ?? "Unknown product",
    scie: "",
    lang: "",
    grup: "Packaged",
    enerc: (n["energy-kcal_100g"] ?? 0) * KJ_PER_KCAL,
    protcnt: n.proteins_100g ?? 0,
    fatce: n.fat_100g ?? 0,
    choavldf: n.carbohydrates_100g ?? 0,
    fibtg: n.fiber_100g ?? 0,
  };
}

export interface FoodSearchRef {
  editLog: (log: any) => void;
  refreshFavorites: () => void;
  openForMeal: (meal: string) => void;
  openMealBuilder: () => void;
}

export const FoodSearch = forwardRef<
  FoodSearchRef,
  {
    userId: string;
    date: string;
    onLogged: () => void;
    meals?: string[];
  }
>(({ userId, date, onLogged, meals: mealsProp }, ref) => {
  const mealCategories = mealsProp && mealsProp.length > 0 ? mealsProp : ["Breakfast", "Lunch", "Dinner", "Snack"];
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<IFCTItem[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IFCTItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [qty, setQty] = useState("100");
  const [meal, setMeal] = useState(() => {
    const cats = mealsProp && mealsProp.length > 0 ? mealsProp : ["Breakfast", "Lunch", "Dinner", "Snack"];
    const h = new Date().getHours();
    const count = cats.length;
    // Distribute meals evenly across waking hours (6am-10pm = 16 hours)
    const idx = Math.min(Math.floor(((h < 6 ? 0 : h - 6) / 16) * count), count - 1);
    return cats[idx];
  });
  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editLogId, setEditLogId] = useState<string | null>(null);

  const loadSavedMeals = () => {
    supabase
      .from("saved_meals" as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSavedMeals(data);
      });
  };

  const saveFavoriteMeal = async (mealData: {
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  }) => {
    const { data: existing } = await supabase
      .from("saved_meals" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("name", mealData.name)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("saved_meals" as any)
        .update(mealData)
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    } else {
      const { error } = await supabase.from("saved_meals" as any).insert({
        user_id: userId,
        ...mealData,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    loadSavedMeals();
    return true;
  };

  useImperativeHandle(ref, () => ({
    openForMeal: (m: string) => {
      setMeal(m);
      if (inputRef.current) {
        inputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    openMealBuilder: () => {
      setMealBuilderOpen(true);
    },
    editLog: (log: any) => {
      setIsEditing(true);
      setEditLogId(log.id);

      const ratio = log.quantity_g / 100;
      const baseCal = ratio > 0 ? log.calories / ratio : 0;
      const baseP = ratio > 0 ? log.protein_g / ratio : 0;
      const baseC = ratio > 0 ? log.carbs_g / ratio : 0;
      const baseF = ratio > 0 ? log.fat_g / ratio : 0;

      setSelected({
        code: "edit",
        name: log.food_name,
        scie: "",
        lang: "",
        grup: "Edited",
        enerc: baseCal * KJ_PER_KCAL,
        protcnt: baseP,
        choavldf: baseC,
        fatce: baseF,
        fibtg: 0,
      });
      setQty(log.quantity_g.toString());
      setMeal(log.meal_type);
      setOpen(true);
    },
    refreshFavorites: loadSavedMeals,
  }));

  // Custom Food
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState("100");
  const [customCal, setCustomCal] = useState("");
  const [customP, setCustomP] = useState("");
  const [customC, setCustomC] = useState("");
  const [customF, setCustomF] = useState("");
  const [customFib, setCustomFib] = useState("");
  const [saveAsMeal, setSaveAsMeal] = useState(false);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false);

  useEffect(() => {
    loadSavedMeals();
  }, [userId]);

  // Camera / AI vision
  const [cameraOpen, setCameraOpen] = useState(false);
  const [aiResult, setAiResult] = useState<AIFoodResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Barcode
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [barcodeVal, setBarcodeVal] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  // Voice logging
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceItems, setVoiceItems] = useState<VoiceFoodItem[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [parsingVoice, setParsingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Meal Builder
  interface MealBuilderItem {
    name: string;
    quantity_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    base_calories: number;
    base_protein_g: number;
    base_carbs_g: number;
    base_fat_g: number;
    base_fiber_g: number;
  }
  const [mealBuilderOpen, setMealBuilderOpen] = useState(false);
  const [mealBuilderName, setMealBuilderName] = useState("");
  const [mealBuilderItems, setMealBuilderItems] = useState<MealBuilderItem[]>(
    [],
  );
  const [mealBuilderSearch, setMealBuilderSearch] = useState("");
  const [mealBuilderSaving, setMealBuilderSaving] = useState(false);
  const [mbOverrideTotals, setMbOverrideTotals] = useState({
    cal: "0",
    p: "0",
    c: "0",
    f: "0",
    fib: "0",
  });
  const [mbAiSuggestions, setMbAiSuggestions] = useState<IFCTItem[]>([]);
  const [mbSearching, setMbSearching] = useState(false);

  const handleMbAiFallback = async () => {
    if (mealBuilderSearch.trim().length < 2) return;
    setMbSearching(true);
    try {
      const prompt = `You are a nutrition expert. The user is searching for "${mealBuilderSearch}". 
If this food is missing from a standard database, provide its typical nutritional values per 100g.
Return ONLY a JSON object with a key "items" containing up to 3 matching items, no markdown:
{
  "items": [
    {
      "code": "ai-fallback",
      "name": "string (specific name)",
      "scie": "",
      "lang": "",
      "grup": "AI Fallback",
      "enerc": number (in KJ, multiply kcal by 4.184),
      "protcnt": number (g),
      "fatce": number (g),
      "choavldf": number (g),
      "fibtg": number (g)
    }
  ]
}
Rules for accuracy:
- For cooked/boiled dals/pulses: ~90-110 kcal per 100g (thick consistency).
- For thin dal/soups: ~40-60 kcal per 100g.
- For cooked rice: ~130 kcal per 100g.
- For Roti (standard): ~120 kcal per 40g (one roti).
Use accurate values for common foods.`;

      const raw = await groqChat({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const results = (parsed.items || []) as IFCTItem[];
      setMbAiSuggestions(results);
    } catch (e: any) {
      console.error("AI fallback failed", e);
    } finally {
      setMbSearching(false);
    }
  };

  const mealBuilderSearchResults = useMemo(() => {
    const term = mealBuilderSearch.trim().toLowerCase();
    if (term.length < 2) return [];
    const matches: { item: IFCTItem; r: number }[] = [];
    for (const it of ITEMS) {
      const r = rank(it, term);
      if (r < 5) matches.push({ item: it, r });
    }
    matches.sort((a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name));
    return matches.slice(0, 8).map((m) => m.item);
  }, [mealBuilderSearch]);

  const allMbSuggestions = useMemo(
    () => [...mealBuilderSearchResults, ...mbAiSuggestions],
    [mealBuilderSearchResults, mbAiSuggestions],
  );

  const mealBuilderTotals = useMemo(() => {
    return mealBuilderItems.reduce(
      (a, it) => ({
        calories: a.calories + it.calories,
        protein_g: a.protein_g + it.protein_g,
        carbs_g: a.carbs_g + it.carbs_g,
        fat_g: a.fat_g + it.fat_g,
        fiber_g: a.fiber_g + it.fiber_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    );
  }, [mealBuilderItems]);

  useEffect(() => {
    setMbOverrideTotals({
      cal: String(Math.round(mealBuilderTotals.calories)),
      p: String(Math.round(mealBuilderTotals.protein_g)),
      c: String(Math.round(mealBuilderTotals.carbs_g)),
      f: String(Math.round(mealBuilderTotals.fat_g)),
      fib: String(Math.round(mealBuilderTotals.fiber_g)),
    });
  }, [mealBuilderTotals]);

  const addItemToMealBuilder = (item: IFCTItem, grams: number = 100) => {
    const ratio = grams / 100;
    setMealBuilderItems([
      ...mealBuilderItems,
      {
        name: item.name,
        quantity_g: grams,
        calories: +(kcal(item.enerc) * ratio).toFixed(1),
        protein_g: +((item.protcnt ?? 0) * ratio).toFixed(1),
        carbs_g: +((item.choavldf ?? 0) * ratio).toFixed(1),
        fat_g: +((item.fatce ?? 0) * ratio).toFixed(1),
        fiber_g: +((item.fibtg ?? 0) * ratio).toFixed(1),
        base_calories: kcal(item.enerc),
        base_protein_g: item.protcnt ?? 0,
        base_carbs_g: item.choavldf ?? 0,
        base_fat_g: item.fatce ?? 0,
        base_fiber_g: item.fibtg ?? 0,
      },
    ]);
    setMbAiSuggestions([]);
    setMealBuilderSearch("");
  };

  const saveMealBuilder = async () => {
    if (!mealBuilderName.trim()) {
      toast.error("Add a name for your meal");
      return;
    }
    setMealBuilderSaving(true);
    const ok = await saveFavoriteMeal({
      name: mealBuilderName,
      calories: Number(mbOverrideTotals.cal) || 0,
      protein_g: Number(mbOverrideTotals.p) || 0,
      carbs_g: Number(mbOverrideTotals.c) || 0,
      fat_g: Number(mbOverrideTotals.f) || 0,
      fiber_g: Number(mbOverrideTotals.fib) || 0,
    });
    setMealBuilderSaving(false);
    if (!ok) {
      return;
    }
    toast.success(`"${mealBuilderName}" saved to Favorites!`);
    setMealBuilderOpen(false);
    setMealBuilderName("");
    setMealBuilderItems([]);
  };

  // Recent foods (for quick re-logging)
  interface RecentFood {
    food_name: string;
    quantity_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    meal_type: string;
  }
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);

  useEffect(() => {
    // Fetch unique foods from last 7 days for quick re-logging
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().slice(0, 10);

    supabase
      .from("food_logs")
      .select(
        "food_name, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g, meal_type",
      )
      .eq("user_id", userId)
      .gte("date", dateStr)
      .order("logged_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data) return;
        // Deduplicate by food_name, keep most recent entry for each
        const seen = new Map<string, RecentFood>();
        for (const row of data) {
          const key = row.food_name.toLowerCase();
          if (!seen.has(key)) {
            seen.set(key, row as RecentFood);
          }
        }
        setRecentFoods(Array.from(seen.values()).slice(0, 10));
      });
  }, [userId, date]);

  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const matches: { item: IFCTItem; r: number }[] = [];
    for (const it of ITEMS) {
      const r = rank(it, term);
      if (r < 5) matches.push({ item: it, r });
    }
    matches.sort((a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name));
    return matches.slice(0, 12).map((m) => m.item);
  }, [q]);

  const handleAiFallback = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const prompt = `You are a nutrition expert. The user is searching for "${q}". 
If this food is missing from a standard database, provide its typical nutritional values per 100g.
Return ONLY a JSON object with a key "items" containing up to 3 matching items, no markdown:
{
  "items": [
    {
      "code": "ai-fallback",
      "name": "string (specific name)",
      "scie": "",
      "lang": "",
      "grup": "AI Fallback",
      "enerc": number (in KJ, multiply kcal by 4.184),
      "protcnt": number (g),
      "fatce": number (g),
      "choavldf": number (g),
      "fibtg": number (g)
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

      const raw = await groqChat({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const results = (parsed.items || []) as IFCTItem[];
      setAiSuggestions(results);
    } catch (e: any) {
      console.error("AI fallback failed", e);
    } finally {
      setSearching(false);
    }
  };

  const allSuggestions = useMemo(
    () => [...suggestions, ...aiSuggestions],
    [suggestions, aiSuggestions],
  );

  // ── Log helpers ──────────────────────────────────────────────────────────────
  const logFood = async (
    item: IFCTItem,
    grams: number,
    mealType: string,
    overrides?: { cal: number; p: number; c: number; f: number; fib?: number },
  ) => {
    setSaving(true);
    const ratio = grams / 100;
    const cal = overrides
      ? overrides.cal
      : +(kcal(item.enerc) * ratio).toFixed(1);
    const p = overrides
      ? overrides.p
      : +((item.protcnt ?? 0) * ratio).toFixed(1);
    const c = overrides
      ? overrides.c
      : +((item.choavldf ?? 0) * ratio).toFixed(1);
    const f = overrides ? overrides.f : +((item.fatce ?? 0) * ratio).toFixed(1);
    const fib =
      overrides && overrides.fib !== undefined
        ? overrides.fib
        : +((item.fibtg ?? 0) * ratio).toFixed(1);

    let error;
    if (isEditing && editLogId) {
      const { error: updateErr } = await supabase
        .from("food_logs")
        .update({
          meal_type: mealType,
          quantity_g: grams,
          calories: cal,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
          fiber_g: fib,
        })
        .eq("id", editLogId);
      error = updateErr;
    } else {
      const { error: insertErr } = await supabase.from("food_logs").insert({
        user_id: userId,
        date,
        meal_type: mealType,
        food_name: item.name,
        quantity_g: grams,
        calories: cal,
        protein_g: p,
        carbs_g: c,
        fat_g: f,
        fiber_g: fib,
      });
      error = insertErr;
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  };

  const logAiFood = async () => {
    if (!aiResult) return;
    const ok = await logFood(
      {
        code: "ai",
        name: aiResult.food_name,
        scie: "",
        lang: "",
        grup: "AI",
        enerc: aiResult.calories_per_100g * KJ_PER_KCAL,
        protcnt: aiResult.protein_per_100g,
        fatce: aiResult.fat_per_100g,
        choavldf: aiResult.carbs_per_100g,
        fibtg: aiResult.fiber_per_100g || 0,
      },
      aiResult.estimated_weight_g,
      meal,
    );
    if (ok) {
      toast.success(`${aiResult.food_name} logged!`);
      setCameraOpen(false);
      setAiResult(null);
      setImagePreview(null);
      onLogged();
    }
  };

  const logAllVoiceItems = async () => {
    if (voiceItems.length === 0) return;
    setSaving(true);
    const rows = voiceItems.map((item) => ({
      user_id: userId,
      date,
      meal_type: item.meal_type,
      food_name: item.food_name,
      quantity_g: item.quantity_g,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g || 0,
    }));
    const { error } = await supabase.from("food_logs").insert(rows);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `${voiceItems.length} food item${voiceItems.length > 1 ? "s" : ""} logged!`,
    );
    setVoiceOpen(false);
    setTranscript("");
    setVoiceItems([]);
    onLogged();
  };

  // ── Camera ───────────────────────────────────────────────────────────────────
  const webcamRef = useRef<Webcam>(null);

  const captureAiPhoto = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setImagePreview(imageSrc);
    setAnalyzing(true);
    try {
      const base64 = imageSrc.split(",")[1];
      const result = await recognizeFoodFromImage(base64, "image/jpeg");
      setAiResult(result);
    } catch (e: any) {
      toast.error("Could not identify food: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Barcode ──────────────────────────────────────────────────────────────────
  const barcodeWebcamRef = useRef<Webcam>(null);
  const [scanningBarcode, setScanningBarcode] = useState(false);

  const captureBarcodePhoto = async () => {
    const imageSrc = barcodeWebcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setScanningBarcode(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(imageSrc);

      if (result && result.getText()) {
        const text = result.getText();
        setBarcodeVal(text);
        toast.success(`Scanned: ${text}`);
      } else {
        toast.error("Could not find a clear barcode in the image. Try again.");
      }
    } catch (err) {
      console.error(err);
      toast.error(
        "No barcode detected. Please ensure the barcode is clear and in focus.",
      );
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleBarcode = async (valToLookup = barcodeVal) => {
    if (!valToLookup) return;
    setLookingUp(true);
    const item = await lookupBarcode(valToLookup.trim());
    setLookingUp(false);
    if (!item) {
      toast.error("Product not found.");
      return;
    }
    setSelected(item);
    setQty("100");
    setBarcodeMode(false);
    setBarcodeVal("");
    setOpen(true);
  };

  // ── Voice recording ───────────────────────────────────────────────────────────
  const startRecording = async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Live speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setRecording(true);
        setTranscript("");
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = "";
        for (let i = 0; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== "no-speech") {
          toast.error("Speech recognition error: " + event.error);
          setRecording(false);
        }
      };

      recognition.start();
      mediaRecorderRef.current = recognition as any;
    } catch (e: any) {
      toast.error("Microphone access denied or error: " + e.message);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current) {
      (mediaRecorderRef.current as any).stop();
    }
    setRecording(false);

    if (transcript.trim().length > 0) {
      setParsingVoice(true);
      try {
        const items = await parseVoiceFoodLog(transcript, meal);
        setVoiceItems(items);
        if (items.length === 0) {
          toast.info("No food items detected. Try again.");
        }
      } catch (e: any) {
        toast.error("Parsing failed: " + e.message);
      } finally {
        setParsingVoice(false);
      }
    }
  };

  const macrosFor = (item: IFCTItem, g: number) => ({
    cal: +((kcal(item.enerc) * g) / 100).toFixed(0),
    p: +(((item.protcnt ?? 0) * g) / 100).toFixed(1),
    c: +(((item.choavldf ?? 0) * g) / 100).toFixed(1),
    f: +(((item.fatce ?? 0) * g) / 100).toFixed(1),
    fib: +(((item.fibtg ?? 0) * g) / 100).toFixed(1),
  });
  const m = selected ? macrosFor(selected, +qty || 100) : null;

  const [overrideCal, setOverrideCal] = useState<string>("");
  const [overrideP, setOverrideP] = useState<string>("");
  const [overrideC, setOverrideC] = useState<string>("");
  const [overrideF, setOverrideF] = useState<string>("");

  useEffect(() => {
    if (selected && m) {
      setOverrideCal(m.cal.toString());
      setOverrideP(m.p.toString());
      setOverrideC(m.c.toString());
      setOverrideF(m.f.toString());
    }
  }, [m?.cal, m?.p, m?.c, m?.f, selected]);

  const MacroGrid = ({
    items,
  }: {
    items: { label: string; val: string }[];
  }) => (
    <div className="grid grid-cols-5 gap-2 text-center text-xs">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border bg-muted/30 p-2"
        >
          <p className="text-muted-foreground">{s.label}</p>
          <p className="font-semibold">{s.val}</p>
        </div>
      ))}
    </div>
  );

  const MealSelect = () => (
    <Select value={meal} onValueChange={setMeal}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {mealCategories.map((m) => (
          <SelectItem key={m} value={m}>
            {m}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      {/* ── Search bar ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search food…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (aiSuggestions.length > 0) setAiSuggestions([]);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleAiFallback()}
          className="pl-9"
        />
        {q.length >= 2 && suggestions.length === 0 && !searching && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAiFallback}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-[10px] text-accent uppercase font-bold px-2 hover:bg-accent/10"
          >
            Search AI
          </Button>
        )}
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Inline favourites section removed — now accessible via Favourites button */}

      {/* ── Suggestions ── */}
      {allSuggestions.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {allSuggestions.map((it) => (
            <button
              key={
                it.code === "ai-fallback" ? `${it.code}-${it.name}` : it.code
              }
              onClick={() => {
                setSelected(it);
                setQ("");
                setAiSuggestions([]);
                setOpen(true);
              }}
              className="flex min-w-0 w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0 text-left"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <span className="font-medium truncate">{it.name}</span>
                {it.code === "ai-fallback" && (
                  <Badge className="text-[9px] h-4 px-1 bg-accent/20 text-accent border-none uppercase font-bold shrink-0">
                    AI
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {kcal(it.enerc).toFixed(0)} kcal/100g
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Action buttons: Camera → Mic → Barcode → Favourites ── */}
      <div className="flex gap-3 justify-center flex-wrap">
        <Button
          variant="outline"
          onClick={() => setCameraOpen(true)}
          title="Log food by photo"
          className="flex flex-col items-center justify-center gap-1 p-0"
          style={{ width: 56, height: 56, minWidth: 56 }}
        >
          <Camera style={{ width: 18, height: 18 }} />
          <span className="text-[8px] font-medium text-muted-foreground">
            Photo
          </span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setVoiceOpen(true)}
          title="Log food by voice"
          className="flex flex-col items-center justify-center gap-1 p-0"
          style={{ width: 56, height: 56, minWidth: 56 }}
        >
          <Mic style={{ width: 18, height: 18 }} />
          <span className="text-[8px] font-medium text-muted-foreground">
            Voice
          </span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setBarcodeMode(true)}
          title="Barcode lookup"
          className="flex flex-col items-center justify-center gap-1 p-0"
          style={{ width: 56, height: 56, minWidth: 56 }}
        >
          <Barcode style={{ width: 18, height: 18 }} />
          <span className="text-[8px] font-medium text-muted-foreground">
            Scan
          </span>
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            loadSavedMeals();
            setFavoritesDialogOpen(true);
          }}
          title="View Favourites"
          className="flex flex-col items-center justify-center gap-1 p-0 border-red-500/30 hover:border-red-500/60"
          style={{ width: 56, height: 56, minWidth: 56 }}
        >
          <Heart style={{ width: 18, height: 18 }} className="text-red-500" />
          <span className="text-[8px] font-medium text-red-500">Favourites</span>
        </Button>
      </div>

      {/* ── Favourites Dialog ── */}
      <Dialog open={favoritesDialogOpen} onOpenChange={setFavoritesDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md max-h-[80vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-border/50 rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-wider flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500 fill-current" /> Favourites
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Log to
              </Label>
              <MealSelect />
            </div>
            {savedMeals.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                {savedMeals.map((mealItem) => {
                  const handleLogFavorite = async () => {
                    const customItem: IFCTItem = {
                      code: "saved",
                      name: mealItem.name,
                      scie: "",
                      lang: "",
                      grup: "Custom",
                      enerc: 0,
                      protcnt: 0,
                      fatce: 0,
                      choavldf: 0,
                      fibtg: 0,
                    };
                    const ok = await logFood(customItem, 100, meal, {
                      cal: mealItem.calories,
                      p: mealItem.protein_g,
                      c: mealItem.carbs_g,
                      f: mealItem.fat_g,
                      fib: mealItem.fiber_g || 0,
                    });
                    if (ok) {
                      toast.success(`${mealItem.name} logged!`);
                      onLogged();
                    }
                  };

                  return (
                    <div
                      key={mealItem.id}
                      className="group flex items-center justify-between border-b border-border px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
                    >
                      <button
                        onClick={handleLogFavorite}
                        className="flex items-center gap-3 text-left flex-1 min-w-0"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20">
                          <Heart className="h-4 w-4 text-red-500 fill-current" />
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <span className="text-sm font-semibold truncate block">
                            {mealItem.name}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {Math.round(mealItem.calories)} kcal · P{Math.round(mealItem.protein_g)} · C{Math.round(mealItem.carbs_g)} · F{Math.round(mealItem.fat_g)}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { error } = await supabase
                              .from("saved_meals" as any)
                              .delete()
                              .eq("id", mealItem.id);
                            if (!error) {
                              setSavedMeals(savedMeals.filter((m: any) => m.id !== mealItem.id));
                              toast.success("Removed from favorites");
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <button
                          onClick={handleLogFavorite}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center border border-dashed border-border/50 rounded-xl bg-muted/5">
                <Heart className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No favourites yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Tap the heart icon on logged foods to save them here.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Meal Builder Dialog ── */}
      <Dialog
        open={mealBuilderOpen}
        onOpenChange={(o) => {
          if (!o) {
            setMealBuilderOpen(false);
            setMealBuilderSearch("");
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-accent" /> Create a Meal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Meal Name */}
            <div className="space-y-1">
              <Label>Meal Name</Label>
              <Input
                value={mealBuilderName}
                onChange={(e) => setMealBuilderName(e.target.value)}
                placeholder="e.g., My Protein Milkshake"
              />
            </div>

            {/* Search to add items */}
            <div className="space-y-1">
              <Label>Add Foods</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search or use AI..."
                  value={mealBuilderSearch}
                  onChange={(e) => {
                    setMealBuilderSearch(e.target.value);
                    if (mbAiSuggestions.length > 0) setMbAiSuggestions([]);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleMbAiFallback()}
                  className="pl-9"
                />
                {mealBuilderSearch.length >= 2 && allMbSuggestions.length === 0 && !mbSearching && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMbAiFallback}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3 w-3 text-accent" />
                    <span className="text-accent">AI Search</span>
                  </Button>
                )}
                {mbSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Searching...
                  </div>
                )}
              </div>
              
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm max-h-40 overflow-y-auto">
                {allMbSuggestions.length > 0 && allMbSuggestions.map((it) => (
                  <button
                    key={it.code}
                    onClick={() => addItemToMealBuilder(it, 100)}
                    className="flex min-w-0 w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0 text-left"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      <span className="font-medium truncate">{it.name}</span>
                      {it.code === "ai-fallback" && (
                        <Badge className="text-[9px] h-4 px-1 bg-accent/20 text-accent border-none uppercase font-bold shrink-0">
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {kcal(it.enerc).toFixed(0)} kcal/100g
                      </span>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent">
                        <Plus className="h-3 w-3" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Editable Macros */}
              <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent mb-2">
                  Total Nutrition (Editable)
                </p>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-[9px]">Cal</p>
                    <Input
                      type="number"
                      className="h-8 text-center text-xs px-1 font-bold"
                      value={mbOverrideTotals.cal}
                      onChange={(e) => setMbOverrideTotals({ ...mbOverrideTotals, cal: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-[9px]">Pro</p>
                    <Input
                      type="number"
                      className="h-8 text-center text-xs px-1 font-bold"
                      value={mbOverrideTotals.p}
                      onChange={(e) => setMbOverrideTotals({ ...mbOverrideTotals, p: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-[9px]">Carb</p>
                    <Input
                      type="number"
                      className="h-8 text-center text-xs px-1 font-bold"
                      value={mbOverrideTotals.c}
                      onChange={(e) => setMbOverrideTotals({ ...mbOverrideTotals, c: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-[9px]">Fat</p>
                    <Input
                      type="number"
                      className="h-8 text-center text-xs px-1 font-bold"
                      value={mbOverrideTotals.f}
                      onChange={(e) => setMbOverrideTotals({ ...mbOverrideTotals, f: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-[9px]">Fib</p>
                    <Input
                      type="number"
                      className="h-8 text-center text-xs px-1 font-bold"
                      value={mbOverrideTotals.fib}
                      onChange={(e) => setMbOverrideTotals({ ...mbOverrideTotals, fib: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Added items list */}
            {mealBuilderItems.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Ingredients ({mealBuilderItems.length})
                </Label>
                <div className="rounded-xl border border-border overflow-hidden divide-y">
                  {mealBuilderItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 bg-card hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Input
                            type="number"
                            value={item.quantity_g}
                            onChange={(e) => {
                              const newQty = e.target.value === "" ? "" : +e.target.value;
                              const calcQty = +newQty || 0;
                              const ratio = calcQty / 100;
                              const updated = [...mealBuilderItems];
                              updated[i] = {
                                ...item,
                                quantity_g: newQty as number,
                                calories: +(item.base_calories * ratio).toFixed(1),
                                protein_g: +(item.base_protein_g * ratio).toFixed(1),
                                carbs_g: +(item.base_carbs_g * ratio).toFixed(1),
                                fat_g: +(item.base_fat_g * ratio).toFixed(1),
                                fiber_g: +(item.base_fiber_g * ratio).toFixed(1),
                              };
                              setMealBuilderItems(updated);
                            }}
                            className="w-16 h-6 text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground">
                            g
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {Math.round(item.calories)} kcal
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setMealBuilderItems(
                            mealBuilderItems.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <Button
              onClick={saveMealBuilder}
              disabled={mealBuilderSaving || !mealBuilderName.trim()}
              className="w-full h-12 text-base font-bold bg-accent text-accent-foreground hover:bg-accent/90 gap-2 mt-4"
            >
              {mealBuilderSaving ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Heart className="h-6 w-6" />
              )}
              Save to Favorites
            </Button>

            {/* History (Recent Foods) Below Save Button */}
            {recentFoods.length > 0 && (
              <div className="mt-6">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                  History (Recent)
                </Label>
                <div className="rounded-xl border border-border bg-card overflow-hidden divide-y">
                  {recentFoods.map((it, idx) => (
                    <button
                      key={`mb-recent-bottom-${idx}`}
                      onClick={() => {
                        const baseItem = ITEMS.find((m) => m.name === it.food_name);
                        if (baseItem) {
                          addItemToMealBuilder(baseItem, 100);
                        }
                      }}
                      className="flex min-w-0 w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0 text-left"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                        <History className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{it.food_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent">
                          <Plus className="h-3 w-3" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Custom Food dialog ── */}
      <Dialog open={customFoodOpen} onOpenChange={setCustomFoodOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Food</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Food Name</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., Mom's Chicken Curry"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantity (g)</Label>
                <Input
                  type="number"
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Meal</Label>
                <MealSelect />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Cal (kcal)
                </Label>
                <Input
                  type="number"
                  value={customCal}
                  onChange={(e) => setCustomCal(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Pro (g)</Label>
                <Input
                  type="number"
                  value={customP}
                  onChange={(e) => setCustomP(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Carbs (g)
                </Label>
                <Input
                  type="number"
                  value={customC}
                  onChange={(e) => setCustomC(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fat (g)</Label>
                <Input
                  type="number"
                  value={customF}
                  onChange={(e) => setCustomF(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fib (g)</Label>
                <Input
                  type="number"
                  value={customFib}
                  onChange={(e) => setCustomFib(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="saveMeal"
                checked={saveAsMeal}
                onChange={(e) => setSaveAsMeal(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="saveMeal">Save to My Meals (Favorites)</Label>
            </div>
            <Button
              onClick={async () => {
                if (!customName.trim() || !customCal) {
                  toast.error("Name and Calories are required");
                  return;
                }
                const customItem: IFCTItem = {
                  code: "custom",
                  name: customName,
                  scie: "",
                  lang: "",
                  grup: "Custom",
                  enerc: 0,
                  protcnt: 0,
                  fatce: 0,
                  choavldf: 0,
                  fibtg: 0,
                };
                const ok = await logFood(customItem, +customQty || 100, meal, {
                  cal: +customCal,
                  p: +customP || 0,
                  c: +customC || 0,
                  f: +customF || 0,
                  fib: +customFib || 0,
                });

                if (ok && saveAsMeal) {
                  await saveFavoriteMeal({
                    name: customName,
                    calories: +customCal,
                    protein_g: +customP || 0,
                    carbs_g: +customC || 0,
                    fat_g: +customF || 0,
                    fiber_g: +customFib || 0,
                  });
                }

                if (ok) {
                  toast.success(`${customName} logged!`);
                  setCustomFoodOpen(false);
                  setCustomName("");
                  setCustomCal("");
                  setCustomP("");
                  setCustomC("");
                  setCustomF("");
                  setCustomFib("");
                  onLogged();
                }
              }}
              disabled={saving}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Log Custom Food
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Text search log dialog ── */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setSelected(null);
            setIsEditing(false);
            setEditLogId(null);
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader className="pr-6">
            <DialogTitle className="flex items-center gap-2 text-left">
              <span className="truncate">{selected?.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSaveAsMeal((prev) => !prev);
                }}
                aria-label={
                  saveAsMeal ? "Remove from favorites save" : "Save to favorites"
                }
                title={
                  saveAsMeal
                    ? "Will not save to favorites"
                    : "Also save to favorites"
                }
                className={`shrink-0 h-9 w-9 rounded-full ${
                  saveAsMeal
                    ? "text-red-500 hover:bg-red-500/10"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Heart className={`h-5 w-5 ${saveAsMeal ? "fill-current" : ""}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selected && m && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Cal (kcal)
                  </Label>
                  <Input
                    type="number"
                    value={overrideCal}
                    onChange={(e) => setOverrideCal(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Pro (g)
                  </Label>
                  <Input
                    type="number"
                    value={overrideP}
                    onChange={(e) => setOverrideP(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Carbs (g)
                  </Label>
                  <Input
                    type="number"
                    value={overrideC}
                    onChange={(e) => setOverrideC(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Fat (g)
                  </Label>
                  <Input
                    type="number"
                    value={overrideF}
                    onChange={(e) => setOverrideF(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Fib (g)
                  </Label>
                  <Input type="number" defaultValue={m.fib} id="overrideFib" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Quantity (g)</Label>
                  <Input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Meal</Label>
                  <MealSelect />
                </div>
              </div>
              <Button
                onClick={async () => {
                  const oFib = (
                    document.getElementById("overrideFib") as HTMLInputElement
                  ).value;
                  const overrides = {
                    cal: +overrideCal,
                    p: +overrideP,
                    c: +overrideC,
                    f: +overrideF,
                    fib: +oFib,
                  };

                  const ok = await logFood(
                    selected,
                    +qty || 100,
                    meal,
                    overrides,
                  );
                  if (ok) {
                    if (saveAsMeal) {
                      const favOk = await saveFavoriteMeal({
                        name: selected.name,
                        calories: overrides.cal,
                        protein_g: overrides.p,
                        carbs_g: overrides.c,
                        fat_g: overrides.f,
                        fiber_g: overrides.fib,
                      });
                      if (favOk) {
                        setSaveAsMeal(false);
                      }
                    }
                    toast.success(
                      `${selected.name} ${isEditing ? "modified" : "logged"}!`,
                    );
                    setOpen(false);
                    setSelected(null);
                    setQ("");
                    setIsEditing(false);
                    setEditLogId(null);
                    onLogged();
                  }
                }}
                disabled={saving}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEditing ? (
                  <span className="font-bold">✓</span>
                ) : (
                  <Plus className="h-4 w-4" />
                )}{" "}
                {isEditing ? "Modify" : "Log food"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AI Camera dialog ── */}
      <Dialog
        open={cameraOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCameraOpen(false);
            setAiResult(null);
            setImagePreview(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" /> AI Food Recognition
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Place your hand next to the food for better portion accuracy, then
              snap a photo.
            </p>
            {!imagePreview && (
              <div className="relative overflow-hidden rounded-lg border-2 border-border bg-black min-h-[300px] flex items-center justify-center">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: "environment" }}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 inset-x-0 flex justify-center">
                  <button
                    onClick={captureAiPhoto}
                    className="h-16 w-16 bg-white rounded-full border-4 border-accent flex items-center justify-center shadow-lg"
                  />
                </div>
              </div>
            )}
            {imagePreview && (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="food"
                  className="w-full max-h-48 rounded-lg object-cover"
                />
                {analyzing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                    <p className="text-sm text-white">Analysing food…</p>
                  </div>
                )}
              </div>
            )}
            {aiResult && !analyzing && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{aiResult.food_name}</h3>
                  <Badge
                    variant={
                      aiResult.confidence === "high" ? "default" : "outline"
                    }
                    className="text-xs capitalize"
                  >
                    {aiResult.confidence} confidence
                  </Badge>
                </div>
                <MacroGrid
                  items={[
                    {
                      label: "Calories",
                      val: `${Math.round((aiResult.calories_per_100g * aiResult.estimated_weight_g) / 100)} kcal`,
                    },
                    {
                      label: "Protein",
                      val: `${((aiResult.protein_per_100g * aiResult.estimated_weight_g) / 100).toFixed(1)}g`,
                    },
                    {
                      label: "Carbs",
                      val: `${((aiResult.carbs_per_100g * aiResult.estimated_weight_g) / 100).toFixed(1)}g`,
                    },
                    {
                      label: "Fat",
                      val: `${((aiResult.fat_per_100g * aiResult.estimated_weight_g) / 100).toFixed(1)}g`,
                    },
                    {
                      label: "Fiber",
                      val: `${(((aiResult.fiber_per_100g || 0) * aiResult.estimated_weight_g) / 100).toFixed(1)}g`,
                    },
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Weight (g)</Label>
                    <Input
                      type="number"
                      value={aiResult.estimated_weight_g}
                      onChange={(e) =>
                        setAiResult({
                          ...aiResult,
                          estimated_weight_g: +e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Meal</Label>
                    <MealSelect />
                  </div>
                </div>
                {aiResult.notes && (
                  <p className="text-xs text-muted-foreground italic">
                    {aiResult.notes}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAiResult(null);
                      setImagePreview(null);
                    }}
                    className="gap-1"
                  >
                    <X className="h-3 w-3" /> Retake
                  </Button>
                  <Button
                    onClick={logAiFood}
                    disabled={saving}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}{" "}
                    Log this food
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Voice logging dialog ── */}
      <Dialog
        open={voiceOpen}
        onOpenChange={(o) => {
          if (!o) {
            if (recording) stopRecording();
            setVoiceOpen(false);
            setTranscript("");
            setVoiceItems([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4" /> Voice Food Log
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Meal type</Label>
              <MealSelect />
            </div>
            <p className="text-sm text-muted-foreground">
              Say what you ate naturally — e.g.{" "}
              <em>"I had 2 rotis, a bowl of dal, and a banana"</em>
            </p>

            {/* Record button */}
            <div className="flex justify-center">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={transcribing || parsingVoice}
                className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all ${
                  recording
                    ? "animate-pulse border-destructive bg-destructive/10"
                    : "border-accent bg-accent/10 hover:bg-accent/20"
                }`}
              >
                {recording ? (
                  <MicOff className="h-8 w-8 text-destructive" />
                ) : (
                  <Mic className="h-8 w-8 text-accent" />
                )}
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {recording ? "Recording… tap to stop" : "Tap to start recording"}
            </p>

            {/* Processing states */}
            {transcribing && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Transcribing audio…
              </div>
            )}
            {parsingVoice && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Parsing food items…
              </div>
            )}

            {/* Transcript live/edit view */}
            {transcript && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 mt-4 space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    You said (Tap to edit):
                  </p>
                  {!recording && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs px-2"
                      onClick={() => {
                        setParsingVoice(true);
                        parseVoiceFoodLog(transcript, meal)
                          .then((items) => {
                            setVoiceItems(items);
                            setParsingVoice(false);
                          })
                          .catch((e) => {
                            toast.error("Parsing failed: " + e.message);
                            setParsingVoice(false);
                          });
                      }}
                      disabled={parsingVoice}
                    >
                      Re-parse
                    </Button>
                  )}
                </div>
                <Textarea
                  value={transcript}
                  onChange={(e: any) => setTranscript(e.target.value)}
                  className="text-sm italic min-h-[60px] bg-background border-border resize-none"
                  disabled={recording}
                />
              </div>
            )}

            {/* Parsed items */}
            {voiceItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {voiceItems.length} item{voiceItems.length > 1 ? "s" : ""}{" "}
                  detected
                </p>
                <div className="space-y-1">
                  {voiceItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div className="flex-1 mr-4">
                        <span className="font-medium block text-base mb-1">
                          {item.food_name}
                        </span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={item.unit_quantity ?? item.quantity_g}
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value) || 0;
                              if (newQty < 0) return;
                              const oldQty =
                                (item.unit_quantity ?? item.quantity_g) || 1;
                              const ratio = newQty / oldQty;

                              const newItems = [...voiceItems];
                              newItems[i] = {
                                ...item,
                                ...(item.unit_quantity !== undefined
                                  ? { unit_quantity: newQty }
                                  : {}),
                                quantity_g: item.quantity_g * ratio,
                                calories: item.calories * ratio,
                                protein_g: item.protein_g * ratio,
                                fat_g: item.fat_g * ratio,
                                carbs_g: item.carbs_g * ratio,
                                fiber_g: item.fiber_g * ratio,
                              };
                              setVoiceItems(newItems);
                            }}
                            className="w-20 h-8 text-sm bg-background"
                          />
                          <span className="text-xs text-muted-foreground">
                            {item.unit && item.unit !== "g" ? item.unit : "g"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            const newItems = [...voiceItems];
                            newItems.splice(i, 1);
                            setVoiceItems(newItems);
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </Button>
                        <span className="text-xs text-muted-foreground whitespace-nowrap mt-1">
                          {Math.round(item.calories)} kcal · P
                          {item.protein_g.toFixed(0)} · F
                          {(item.fiber_g || 0).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTranscript("");
                      setVoiceItems([]);
                    }}
                  >
                    Redo
                  </Button>
                  <Button
                    onClick={logAllVoiceItems}
                    disabled={saving}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Log all {voiceItems.length} items
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Barcode dialog ── */}
      <Dialog
        open={barcodeMode}
        onOpenChange={(o) => {
          if (!o) {
            setBarcodeMode(false);
            setBarcodeVal("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-4 w-4" /> Barcode Lookup
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <div className="relative overflow-hidden rounded-lg border-2 border-border bg-black min-h-[250px] flex items-center justify-center">
                <Webcam
                  audio={false}
                  ref={barcodeWebcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: "environment" }}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 inset-x-0 flex justify-center">
                  <button
                    onClick={captureBarcodePhoto}
                    disabled={scanningBarcode}
                    className="h-14 w-14 bg-white rounded-full border-4 border-accent flex items-center justify-center shadow-lg disabled:opacity-50"
                  >
                    {scanningBarcode && (
                      <Loader2 className="h-6 w-6 animate-spin text-accent" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground font-bold">
                  Or enter manually
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="e.g. 8901030871221"
                value={barcodeVal}
                onChange={(e) => setBarcodeVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBarcode()}
                inputMode="numeric"
              />
              <Button
                onClick={() => handleBarcode()}
                disabled={lookingUp || !barcodeVal}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
              >
                {lookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}{" "}
                Look up product
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
