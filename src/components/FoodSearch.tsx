import {
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useEffect,
  lazy,
  Suspense,
} from "react";
import {
  Search,
  Plus,
  Loader2,
  Camera,
  Barcode,
  Mic,
  PenTool,
  Heart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
import type { MealIngredient, SavedMeal } from "@/lib/meals";
import { serverAiFoodSearchInline, serverFlagFood } from "@/lib/ai";
import { isPersonalName } from "@/lib/foodCache";
import { strongFoods, similarity } from "@/lib/foodFuzzy";
import { toLocalISO } from "@/lib/dates";
import {
  type IFCTItem,
  defaultQtyFor,
  kcalOf,
  KJ_PER_KCAL,
  searchFoods,
} from "@/lib/foodDb";
import {
  type Unit,
  defaultUnitFor,
  pieceGrams,
  toGrams,
  unitsFor,
  validateQuantity,
} from "@/lib/foodUnits";
import {
  validateFoodLogCalories,
  MAX_SINGLE_FOOD_CALORIES,
} from "@/lib/calorieLimits";
import {
  VoiceFoodDialog,
  type VoiceFoodItem,
} from "@/components/VoiceFoodDialog";
import { isIsroTheme } from "@/lib/telemetry";
import type { PhotoFoodResult } from "@/components/PhotoFoodDialog";
import { toastAiError } from "@/lib/aiErrors";
import { recordSearchOutcome, searchAttempt } from "@/lib/searchAttempt";
import { useWaitLabel } from "@/hooks/useWaitLabel";

// Both carry a camera dependency — react-webcam here, @zxing/* via
// BarcodeScanner — and neither renders until its button is tapped.
const PhotoFoodDialog = lazy(() =>
  import("@/components/PhotoFoodDialog").then((m) => ({
    default: m.PhotoFoodDialog,
  })),
);
const ScanFoodDialog = lazy(() =>
  import("@/components/ScanFoodDialog").then((m) => ({
    default: m.ScanFoodDialog,
  })),
);

/** The food_logs fields editLog reads. Nutrients are nullable in the table. */
export interface EditableLog {
  id: string;
  food_name: string;
  meal_type: string;
  quantity_g: number;
  unit?: string | null;
  unit_quantity?: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}

export interface FoodSearchRef {
  editLog: (log: EditableLog) => void;
  refreshFavorites: () => void;
  openForMeal: (meal: string) => void;
}

export const FoodSearch = forwardRef<
  FoodSearchRef,
  {
    userId: string;
    date: string;
    onLogged: () => void;
    meals?: string[];
    dailyTarget?: number | null;
    currentDayCalories?: number;
  }
>((props, ref) => {
  const {
    userId,
    date,
    onLogged,
    meals: mealsProp,
    dailyTarget,
    currentDayCalories = 0,
  } = props;
  const mealCategories =
    mealsProp && mealsProp.length > 0
      ? mealsProp
      : ["Breakfast", "Lunch", "Dinner", "Snack"];
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  // A busy model day can mean a switch to the next model; say so rather than
  // leave a spinner that looks stuck.
  const searchWait = useWaitLabel(searching, "", [
    "Searching with AI…",
    "Checking another AI model…",
    "Still working on it…",
    "Almost there…",
  ]);
  const [aiSuggestions, setAiSuggestions] = useState<IFCTItem[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IFCTItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [qty, setQty] = useState("100");
  const [unit, setUnit] = useState<Unit>("g");
  const [meal, setMeal] = useState(() => {
    const cats =
      mealsProp && mealsProp.length > 0
        ? mealsProp
        : ["Breakfast", "Lunch", "Dinner", "Snack"];
    const h = new Date().getHours();
    const count = cats.length;
    // Distribute meals evenly across waking hours (6am-10pm = 16 hours)
    const idx = Math.min(
      Math.floor(((h < 6 ? 0 : h - 6) / 16) * count),
      count - 1,
    );
    return cats[idx];
  });
  const [saving, setSaving] = useState(false);
  /** Handed to the quick-add dialogs so they can render a meal picker. */
  const mealPicker = {
    value: meal,
    options: mealCategories,
    onChange: setMeal,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editLogId, setEditLogId] = useState<string | null>(null);
  const [editLogOldCalories, setEditLogOldCalories] = useState<number | null>(
    null,
  );

  const loadSavedMeals = () => {
    supabase
      .from("saved_meals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSavedMeals(data as SavedMeal[]);
      });
  };

  const saveFavoriteMeal = async (mealData: {
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    ingredients?: MealIngredient[];
  }) => {
    const { data: existing } = await supabase
      .from("saved_meals")
      .select("id")
      .eq("user_id", userId)
      .eq("name", mealData.name)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("saved_meals")
        .update(mealData)
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    } else {
      const { error } = await supabase.from("saved_meals").insert({
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
        inputRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    editLog: (log) => {
      setIsEditing(true);
      setEditLogId(log.id);
      setEditLogOldCalories(log.calories ?? 0);

      const ratio = log.quantity_g / 100;
      const baseCal = ratio > 0 ? (log.calories ?? 0) / ratio : 0;
      const baseP = ratio > 0 ? (log.protein_g ?? 0) / ratio : 0;
      const baseC = ratio > 0 ? (log.carbs_g ?? 0) / ratio : 0;
      const baseF = ratio > 0 ? (log.fat_g ?? 0) / ratio : 0;

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
        fibtg: ratio > 0 ? (log.fiber_g ?? 0) / ratio : 0,
      });
      // Reopen on the unit it was entered in, so an entry logged as "2 pcs"
      // does not come back as 80 g and lose the count the user typed.
      setUnit((log.unit as Unit) ?? "g");
      setQty(String(log.unit_quantity ?? log.quantity_g));
      setMeal(log.meal_type);
      setOpen(true);
    },
    refreshFavorites: loadSavedMeals,
  }));

  // Custom Food
  /** Identity of a hand-entered food — no piece weight, no density. */
  const CUSTOM_FOOD = { code: "custom", grup: "Custom" };
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState("100");
  const [customUnit, setCustomUnit] = useState<Unit>("g");
  const [customCal, setCustomCal] = useState("");
  const [customP, setCustomP] = useState("");
  const [customC, setCustomC] = useState("");
  const [customF, setCustomF] = useState("");
  const [customFib, setCustomFib] = useState("");
  const [saveAsMeal, setSaveAsMeal] = useState(false);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false);

  useEffect(() => {
    loadSavedMeals();
  }, [userId]);

  // Quick add — each dialog owns the rest of its own state.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  /** Foods parsed from a typed sentence, handed to the voice review list. */
  const [voiceItems, setVoiceItems] = useState<VoiceFoodItem[] | undefined>();
  /** What was typed when those items came from the search box. */
  const [voiceQuery, setVoiceQuery] = useState("");

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
    const dateStr = toLocalISO(sevenDaysAgo);

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
    // Substring first, because it is exact and instant. Only when it finds
    // nothing is the typo-tolerant pass worth running — and that pass is what
    // keeps a food we already hold from ever reaching the paid model.
    // searchFoods rather than a copy of it, so its curated-row tiebreak
    // reaches this list too.
    const matches = searchFoods(term, 12);
    if (matches.length > 0) return matches;
    return strongFoods(term, 8);
  }, [q]);

  /**
   * Per-100 g AI row -> the absolute-macro shape the review list expects.
   * meal-builder's voiceToItem does this conversion in the other direction.
   */
  const aiItemToVoice = (it: IFCTItem): VoiceFoodItem => {
    const grams = it.serving_g ?? 100;
    const ratio = grams / 100;
    return {
      food_name: it.name,
      // The words typed for this food, so a row edit can change them in the
      // sentence too. Present on AI items; catalog items have none.
      heard: (it as IFCTItem & { heard?: string }).heard,
      quantity_g: grams,
      unit: it.piece_g ? "pcs" : "g",
      unit_quantity: it.piece_g ? +(grams / it.piece_g).toFixed(2) : grams,
      meal_type: mealPicker?.value ?? "Snack",
      calories: +(kcalOf(it) * ratio).toFixed(1),
      protein_g: +((it.protcnt ?? 0) * ratio).toFixed(1),
      carbs_g: +((it.choavldf ?? 0) * ratio).toFixed(1),
      fat_g: +((it.fatce ?? 0) * ratio).toFixed(1),
      fiber_g: +((it.fibtg ?? 0) * ratio).toFixed(1),
    };
  };

  /**
   * Search AI. `text` is the Food Search dialog's Research: the same search
   * on the words edited there, which also become the search box's text.
   */
  const handleAiFallback = async (text?: string): Promise<boolean> => {
    const typed = (text ?? q).trim();
    if (typed.length < 2) return false;
    if (text !== undefined) setQ(typed);

    // The user's own saved meals come first, for EVERY query, possessive or
    // not: a query matching one of them is that user's own meal whatever it
    // says ("post-gym shake" is as private as "my shake"), so it is answered
    // here with the saved values and never sent to the server, where it could
    // join the shared cache. Client-side because savedMeals is already loaded
    // under per-user RLS — no round trip. A miss goes on to the AI path, where
    // isPersonalName still keeps a possessive out of the shared tables.
    const own = savedMeals.find(
      (m) => similarity(m.name.toLowerCase(), typed.toLowerCase()) >= 0.8,
    );
    if (own) {
      setVoiceOpen(false);
      setVoiceItems(undefined);
      await logSavedMeal(own);
      setQ("");
      return true;
    }

    setSearching(true);
    try {
      const { kind, items } = await serverAiFoodSearchInline({
        data: { query: typed, attempt: searchAttempt() },
      });
      recordSearchOutcome(true);
      if (kind === "meal" && items.length > 1) {
        // Several foods in one sentence. The pick-one list cannot express that,
        // but the voice review list already can — per-item quantities, edits
        // and a single bulk log.
        setVoiceItems(items.map(aiItemToVoice));
        setVoiceQuery(typed);
        setVoiceOpen(true);
        setAiSuggestions([]);
        return true;
      }
      // One food: the pick-one list, so a Research that now finds a single
      // food leaves the Food Search dialog for it.
      setVoiceOpen(false);
      setVoiceItems(undefined);
      // Each suggestion remembers what was typed for it, so a personal name
      // can be saved under the user's words when it is logged (see logFood).
      setAiSuggestions(
        ((items || []) as IFCTItem[]).map((it) => ({ ...it, query: typed })),
      );
      return true;
    } catch (e) {
      recordSearchOutcome(false);
      toastAiError(e, "AI food search");
      return false;
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
    /** What the user actually typed, when it was not grams. */
    entered?: { unit: string; qty: number },
  ) => {
    const ratio = grams / 100;
    const cal = overrides ? overrides.cal : +(kcalOf(item) * ratio).toFixed(1);
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

    const validation = validateFoodLogCalories(
      cal,
      currentDayCalories,
      dailyTarget,
      isEditing ? (editLogOldCalories ?? undefined) : undefined,
    );

    if (!validation.allowed) {
      toast.error(validation.reason);
      return false;
    }

    setSaving(true);
    let error;
    if (isEditing && editLogId) {
      const { error: updateErr } = await supabase
        .from("food_logs")
        .update({
          meal_type: mealType,
          quantity_g: grams,
          unit: entered?.unit ?? "g",
          unit_quantity: entered?.qty ?? grams,
          calories: cal,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
          fiber_g: fib,
        })
        .eq("id", editLogId);
      error = updateErr;
      // Only an edit that changed the numbers is a correction. A quantity- or
      // meal-only edit leaves them at what the log itself implies, and
      // flagging it would pin this user to the log's old numbers — possibly
      // an estimate from before the food was verified — for good. Whether the
      // food is a verified one at all is the server's call: food_logs records
      // no provenance, so serverFlagFood works it out from the name.
      const implied = macrosFor(item, grams);
      const saved = { cal, p, c, f, fib };
      const corrected = (Object.keys(saved) as (keyof typeof saved)[]).some(
        (k) => saved[k] !== implied[k],
      );
      if (!updateErr && corrected) {
        // Not awaited, every failure swallowed: the edit above is already
        // saved, and a correction that does not land only costs the override.
        serverFlagFood({
          data: {
            food_name: item.name,
            quantity_g: grams,
            calories: cal,
            protein_g: p,
            carbs_g: c,
            fat_g: f,
            fiber_g: fib,
          },
        }).catch((e) =>
          console.warn("[food-cache] correction not recorded", e),
        );
      }
    } else {
      const { error: insertErr } = await supabase.from("food_logs").insert({
        user_id: userId,
        date,
        meal_type: mealType,
        food_name: item.name,
        quantity_g: grams,
        unit: entered?.unit ?? "g",
        unit_quantity: entered?.qty ?? grams,
        calories: cal,
        protein_g: p,
        carbs_g: c,
        fat_g: f,
        fiber_g: fib,
      });
      error = insertErr;
      // Auto-save on log, not on search: searching a private name saves
      // nothing, but logging one is the signal that the name means
      // something, and it makes the next search of it free. These are the
      // same whole-log kcal totals just inserted above — saved_meals is
      // whole-meal kcal, never per-100g/kJ, so nothing here is converted or
      // divided by quantity.
      // Tested on, and saved under, what the user TYPED. An AI item's own
      // name is the model's corrected English — "Protein Shake" for "my
      // shake" — which is never personal, so testing it never fired.
      // Never for a custom food: its "Save to My Meals" box already asked,
      // and an unticked box is the user's answer — even for a possessive
      // name like the field's own placeholder, "Mom's Chicken Curry".
      const typed = item.code === "custom" ? undefined : item.query?.trim();
      if (!insertErr && typed && isPersonalName(typed)) {
        await saveFavoriteMeal({
          name: typed,
          calories: cal,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
          fiber_g: fib,
        });
      }
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (validation.isOverSoftTarget) {
      toast.info("Logged! Note: you are over 125% of your daily goal");
    }
    return true;
  };

  /**
   * Log a saved meal at its stored totals. The one place a saved_meals row
   * turns into a food_logs row — the Favourites list and a saved-meal
   * search match (handleAiFallback) both call this rather than each logging
   * it their own way, so the two can't drift apart.
   */
  const logSavedMeal = async (mealItem: {
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  }) => {
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
    return ok;
  };

  const logPhotoFood = async ({ item, grams }: PhotoFoodResult) => {
    const ok = await logFood(item, grams, meal);
    if (ok) {
      toast.success(`${item.name} logged!`);
      setCameraOpen(false);
      onLogged();
    }
  };

  /** The parser returns several foods at once, so this inserts rows directly. */
  const logVoiceItems = async (items: VoiceFoodItem[]) => {
    if (items.length === 0) return;

    for (const item of items) {
      if (item.calories > MAX_SINGLE_FOOD_CALORIES) {
        toast.error(
          `"${item.food_name}" exceeds single item limit of 4,000 kcal`,
        );
        return;
      }
      if (item.calories < 0) {
        toast.error(`"${item.food_name}" cannot have negative calories`);
        return;
      }
    }

    const batchCalories = items.reduce(
      (sum, item) => sum + (item.calories || 0),
      0,
    );
    const batchValidation = validateFoodLogCalories(
      batchCalories,
      currentDayCalories,
      dailyTarget,
    );

    if (!batchValidation.allowed) {
      toast.error(batchValidation.reason);
      return;
    }

    const { error } = await supabase.from("food_logs").insert(
      items.map((item) => ({
        user_id: userId,
        date,
        meal_type: item.meal_type,
        food_name: item.food_name,
        quantity_g: item.quantity_g,
        // The parser has always worked these out ("two rotis" → 2 × 40 g); until
        // food_logs had somewhere to put them they were dropped at insert.
        unit: item.unit ?? "g",
        unit_quantity: item.unit_quantity ?? item.quantity_g,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g || 0,
      })),
    );
    // Throwing leaves the dialog open with its items intact so they can retry.
    if (error) {
      toast.error(error.message);
      throw new Error(error.message);
    }
    if (batchValidation.isOverSoftTarget) {
      toast.info("Logged! Note: you are over 125% of your daily goal");
    }
    toast.success(
      `${items.length} food item${items.length > 1 ? "s" : ""} logged!`,
    );
    setVoiceOpen(false);
    onLogged();
  };

  const macrosFor = (item: IFCTItem, g: number) => ({
    cal: +((kcalOf(item) * g) / 100).toFixed(0),
    p: +(((item.protcnt ?? 0) * g) / 100).toFixed(1),
    c: +(((item.choavldf ?? 0) * g) / 100).toFixed(1),
    f: +(((item.fatce ?? 0) * g) / 100).toFixed(1),
    fib: +(((item.fibtg ?? 0) * g) / 100).toFixed(1),
  });
  // Grams are what the macros scale on; the unit only decides how many of them
  // the typed number means. An empty field is 0, not 100 — with units in play,
  // silently defaulting would mean 100 *pieces*. The validator owns that case.
  const grams = selected ? toGrams(+qty || 0, unit, selected) : 0;
  const qv: ReturnType<typeof validateQuantity> = selected
    ? validateQuantity(qty, unit, selected)
    : { ok: false, error: "" };
  const m = selected ? macrosFor(selected, grams) : null;

  const [overrideCal, setOverrideCal] = useState<string>("");
  const [overrideP, setOverrideP] = useState<string>("");
  const [overrideC, setOverrideC] = useState<string>("");
  const [overrideF, setOverrideF] = useState<string>("");
  const [overrideFib, setOverrideFib] = useState<string>("");

  useEffect(() => {
    if (selected && m) {
      setOverrideCal(m.cal.toString());
      setOverrideP(m.p.toString());
      setOverrideC(m.c.toString());
      setOverrideF(m.f.toString());
      setOverrideFib(m.fib.toString());
    }
  }, [m?.cal, m?.p, m?.c, m?.f, m?.fib, selected]);

  /**
   * Open the log dialog on a food. Countable foods open in pieces at 1, so
   * logging two idlis is two taps and no arithmetic.
   */
  const pickFood = (it: IFCTItem) => {
    const u = defaultUnitFor(it);
    setSelected(it);
    setUnit(u);
    setQty(u === "pcs" ? "1" : String(defaultQtyFor(it)));
    setOpen(true);
  };

  /**
   * Re-default the count rather than reinterpret or back-convert it. Keeping
   * the number would turn 100 g into 100 pieces; converting it would freeze the
   * macros and make the selector feel inert.
   */
  const changeUnit = (u: Unit) => {
    setUnit(u);
    if (!selected) return;
    setQty(u === "g" || u === "ml" ? String(defaultQtyFor(selected)) : "1");
  };

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
          placeholder={
            isIsroTheme() ? "Search ISRO payload rations…" : "Search food…"
          }
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (aiSuggestions.length > 0) setAiSuggestions([]);
          }}
          onKeyDown={(e) => {
            // Only reach for the AI when the local database came up empty —
            // Enter is a typing habit, and firing it over a list of local
            // matches spends a metered Groq call on an answered query.
            if (e.key === "Enter" && suggestions.length === 0)
              handleAiFallback();
          }}
          className="pl-9"
        />
        {q.length >= 2 && suggestions.length === 0 && !searching && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAiFallback()}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-[10px] text-accent uppercase font-bold px-2 hover:bg-accent/10"
          >
            Search AI
          </Button>
        )}
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {searchWait.long && (
        <p
          className="-mt-1 text-center text-xs text-muted-foreground"
          aria-live="polite"
        >
          {searchWait.label}
        </p>
      )}

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
                pickFood(it);
                setQ("");
                setAiSuggestions([]);
              }}
              className="flex min-w-0 w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0 text-left"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <span className="font-medium truncate">{it.name}</span>
                {it.heard &&
                  it.heard.toLowerCase() !== it.name.toLowerCase() && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      for "{it.heard}"
                    </span>
                  )}
                {it.code === "ai-fallback" && (
                  <Badge className="text-[9px] h-4 px-1 bg-accent/20 text-accent border-none uppercase font-bold shrink-0">
                    AI
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {kcalOf(it).toFixed(0)} kcal/100g
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
          style={{ width: 64, height: 64, minWidth: 64 }}
        >
          <Camera style={{ width: 22, height: 22 }} />
          <span className="text-[8px] font-medium text-muted-foreground">
            Photo
          </span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setVoiceOpen(true)}
          title="Log food by voice"
          className="flex flex-col items-center justify-center gap-1 p-0"
          style={{ width: 64, height: 64, minWidth: 64 }}
        >
          <Mic style={{ width: 22, height: 22 }} />
          <span className="text-[8px] font-medium text-muted-foreground">
            Voice
          </span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setBarcodeMode(true)}
          title="Barcode lookup"
          className="flex flex-col items-center justify-center gap-1 p-0"
          style={{ width: 64, height: 64, minWidth: 64 }}
        >
          <Barcode style={{ width: 22, height: 22 }} />
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
          style={{ width: 64, height: 64, minWidth: 64 }}
        >
          <Heart style={{ width: 22, height: 22 }} className="text-red-500" />
          <span className="text-[8px] font-medium text-red-500">
            Favourites
          </span>
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
                  const handleLogFavorite = () => logSavedMeal(mealItem);

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
                            {Math.round(mealItem.calories)} kcal · P
                            {Math.round(mealItem.protein_g)} · C
                            {Math.round(mealItem.carbs_g)} · F
                            {Math.round(mealItem.fat_g)}
                          </span>
                          {mealItem.ingredients &&
                            mealItem.ingredients.length > 0 && (
                              <span className="block truncate text-[9px] text-muted-foreground/80 mt-0.5">
                                {mealItem.ingredients
                                  .map(
                                    (ig) =>
                                      `${ig.name} (${ig.quantity_g}g - ${Math.round(ig.calories)}kcal)`,
                                  )
                                  .join(", ")}
                              </span>
                            )}
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
                              .from("saved_meals")
                              .delete()
                              .eq("id", mealItem.id);
                            if (!error) {
                              setSavedMeals(
                                savedMeals.filter((m) => m.id !== mealItem.id),
                              );
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
                <p className="text-sm font-medium text-muted-foreground">
                  No favourites yet
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Tap the heart icon on logged foods to save them here.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Custom Food dialog ── */}
      <Dialog open={customFoodOpen} onOpenChange={setCustomFoodOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                <Label>Quantity</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="flex-1 min-w-0"
                  />
                  <Select
                    value={customUnit}
                    onValueChange={(u) => setCustomUnit(u as Unit)}
                  >
                    <SelectTrigger
                      className="w-[78px] shrink-0"
                      aria-label="Unit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* A custom food has no piece weight, so no pcs. */}
                      {unitsFor(CUSTOM_FOOD).map((u) => (
                        <SelectItem key={u} value={u} className="min-h-[44px]">
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Meal</Label>
                <MealSelect />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
                  ...CUSTOM_FOOD,
                  name: customName,
                  scie: "",
                  lang: "",
                  enerc: 0,
                  protcnt: 0,
                  fatce: 0,
                  choavldf: 0,
                  fibtg: 0,
                };
                // The macros here are absolute, not per-100 g, so the unit only
                // decides how many grams get stored alongside them.
                const cqv = validateQuantity(
                  customQty,
                  customUnit,
                  CUSTOM_FOOD,
                );
                if (!cqv.ok) {
                  toast.error(cqv.error);
                  return;
                }
                const ok = await logFood(
                  customItem,
                  cqv.value,
                  meal,
                  {
                    cal: +customCal,
                    p: +customP || 0,
                    c: +customC || 0,
                    f: +customF || 0,
                    fib: +customFib || 0,
                  },
                  { unit: customUnit, qty: +customQty },
                );

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
                  setCustomQty("100");
                  setCustomUnit("g");
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
            setEditLogOldCalories(null);
            // Both reset, or a "2" left over from a pcs session reopens as 2 g.
            setUnit("g");
            setQty("100");
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
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
                  saveAsMeal
                    ? "Remove from favorites save"
                    : "Save to favorites"
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
                <Heart
                  className={`h-5 w-5 ${saveAsMeal ? "fill-current" : ""}`}
                />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selected && m && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
                  <Input
                    type="number"
                    value={overrideFib}
                    onChange={(e) => setOverrideFib(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={qty}
                      placeholder={unit === "pcs" ? "Enter count" : undefined}
                      onChange={(e) => setQty(e.target.value)}
                      className="flex-1 min-w-0"
                    />
                    <Select
                      value={unit}
                      onValueChange={(u) => changeUnit(u as Unit)}
                    >
                      <SelectTrigger
                        className="w-[78px] shrink-0"
                        aria-label="Unit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unitsFor(selected, unit).map((u) => (
                          <SelectItem
                            key={u}
                            value={u}
                            className="min-h-[44px]"
                          >
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Meal</Label>
                  <MealSelect />
                </div>
              </div>
              {unit !== "g" && (
                <p className="-mt-1 text-xs text-muted-foreground">
                  {unit === "pcs" && `1 piece = ${pieceGrams(selected)} g · `}≈{" "}
                  {grams} g
                </p>
              )}
              {!qv.ok && qv.error && (
                <p className="-mt-1 text-xs text-destructive">{qv.error}</p>
              )}
              {/* Menu items come as a portion, so offer that portion directly —
                  the field still holds grams, which keeps one unit throughout. */}
              {selected?.serving_g && (
                <div className="flex items-center gap-2 -mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      // The chip's contract is "this many grams".
                      setUnit("g");
                      setQty(String(selected.serving_g));
                    }}
                    className="rounded-full border border-accent/40 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                  >
                    1 serving
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selected.serving_est ? "≈" : ""}
                    {selected.serving_g} g
                    {selected.serving_est && " (estimated)"}
                  </span>
                </div>
              )}
              <Button
                onClick={async () => {
                  if (!qv.ok) return;
                  const overrides = {
                    cal: +overrideCal,
                    p: +overrideP,
                    c: +overrideC,
                    f: +overrideF,
                    fib: +overrideFib,
                  };

                  const ok = await logFood(
                    selected,
                    qv.value,
                    meal,
                    overrides,
                    { unit, qty: +qty },
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
                    setEditLogOldCalories(null);
                    setUnit("g");
                    setQty("100");
                    onLogged();
                  }
                }}
                disabled={saving || !qv.ok}
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

      {/* Mounted only while open so react-webcam stays off the initial load. */}
      {cameraOpen && (
        <Suspense fallback={null}>
          <PhotoFoodDialog
            open
            onOpenChange={(o) => !o && setCameraOpen(false)}
            meal={mealPicker}
            onConfirm={logPhotoFood}
          />
        </Suspense>
      )}

      <VoiceFoodDialog
        open={voiceOpen}
        onOpenChange={(o) => {
          setVoiceOpen(o);
          if (!o) setVoiceItems(undefined);
        }}
        meal={mealPicker}
        onConfirm={logVoiceItems}
        initialItems={voiceItems}
        typedQuery={voiceItems ? voiceQuery : undefined}
        onResearch={handleAiFallback}
        onTypedQueryChange={(text) => {
          setVoiceQuery(text);
          setQ(text);
        }}
      />

      {/* Mounted only while open so @zxing/* stays off the initial page load. */}
      {barcodeMode && (
        <Suspense fallback={null}>
          <ScanFoodDialog
            open
            onOpenChange={setBarcodeMode}
            onFound={pickFood}
          />
        </Suspense>
      )}
    </div>
  );
});
