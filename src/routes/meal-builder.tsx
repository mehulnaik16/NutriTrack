import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChefHat,
  Heart,
  History,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import {
  type IFCTItem,
  kcal,
  searchFoods,
  aiFoodSearch,
} from "@/lib/foodDb";

export const Route = createFileRoute("/meal-builder")({
  component: MealBuilderPage,
});

interface BuilderItem {
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

function MealBuilderPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  const [name, setName] = useState("");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [query, setQuery] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<IFCTItem[]>([]);
  const [aiSearching, setAiSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMeals, setSavedMeals] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  // Saved meals — powers the History section + upsert-by-name on save
  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_meals" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSavedMeals(data);
      });
  }, [user]);

  const localResults = useMemo(() => searchFoods(query, 8), [query]);
  const allSuggestions = useMemo(
    () => [...localResults, ...aiSuggestions],
    [localResults, aiSuggestions],
  );

  const totals = useMemo(
    () =>
      items.reduce(
        (a, it) => ({
          calories: a.calories + (it.calories || 0),
          protein_g: a.protein_g + (it.protein_g || 0),
          carbs_g: a.carbs_g + (it.carbs_g || 0),
          fat_g: a.fat_g + (it.fat_g || 0),
          fiber_g: a.fiber_g + (it.fiber_g || 0),
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
      ),
    [items],
  );

  const handleAiSearch = async () => {
    if (query.trim().length < 2) return;
    setAiSearching(true);
    try {
      setAiSuggestions(await aiFoodSearch(query));
    } catch (e) {
      console.error("AI fallback failed", e);
      toast.error("AI search failed — try again");
    } finally {
      setAiSearching(false);
    }
  };

  const addItem = (item: IFCTItem, grams = 100) => {
    const ratio = grams / 100;
    setItems((prev) => [
      ...prev,
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
    setAiSuggestions([]);
    setQuery("");
  };

  const updateQuantity = (i: number, raw: string) => {
    const newQty = raw === "" ? ("" as unknown as number) : +raw;
    const calcQty = +newQty || 0;
    const ratio = calcQty / 100;
    setItems((prev) => {
      const copy = [...prev];
      const item = copy[i];
      copy[i] = {
        ...item,
        quantity_g: newQty,
        calories: +(item.base_calories * ratio).toFixed(1),
        protein_g: +(item.base_protein_g * ratio).toFixed(1),
        carbs_g: +(item.base_carbs_g * ratio).toFixed(1),
        fat_g: +(item.base_fat_g * ratio).toFixed(1),
        fiber_g: +(item.base_fiber_g * ratio).toFixed(1),
      };
      return copy;
    });
  };

  const updateMacro = (
    i: number,
    key: "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g",
    raw: string,
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [key]: +(raw || 0) };
      return copy;
    });
  };

  const save = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Give your meal a name");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one ingredient");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        fiber_g: totals.fiber_g,
        ingredients: items.map((it) => ({
          name: it.name,
          quantity_g: it.quantity_g,
          calories: it.calories,
        })),
      };

      const existing = savedMeals.find(
        (m: any) => m.name?.toLowerCase() === payload.name.toLowerCase(),
      );
      const { error } = existing
        ? await supabase
            .from("saved_meals" as any)
            .update(payload)
            .eq("id", existing.id)
        : await supabase
            .from("saved_meals" as any)
            .insert({ user_id: user.id, ...payload });
      if (error) throw error;

      toast.success(`"${payload.name}" saved to Favourites!`);
      router.history.back();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save meal");
    } finally {
      setSaving(false);
    }
  };

  // History: unique ingredients from previously saved meals
  const historyItems = useMemo(() => {
    const uniqueNames = Array.from(
      new Set(
        savedMeals
          .flatMap((m: any) => m.ingredients || [])
          .map((ig: any) => ig.name),
      ),
    );
    return uniqueNames
      .map((n) => searchFoods(String(n), 1)[0])
      .filter((it): it is IFCTItem => Boolean(it && it.name))
      .slice(0, 8);
  }, [savedMeals]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-44 md:pb-32">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => router.history.back()}
            aria-label="Back to Food"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <ChefHat className="h-5 w-5 shrink-0 text-accent" />
            <h1 className="truncate font-display text-lg font-bold">
              Create a Meal
            </h1>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {/* ── Meal name ── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Meal name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Protein Milkshake"
            className="h-12 rounded-xl text-base font-semibold"
          />
        </div>

        {/* ── Add foods ── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Add ingredients
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search foods or use AI…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (aiSuggestions.length > 0) setAiSuggestions([]);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
              className="h-12 rounded-xl pl-9"
            />
            {query.length >= 2 &&
              allSuggestions.length === 0 &&
              !aiSearching && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAiSearch}
                  className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 gap-1.5 text-xs"
                >
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span className="font-bold text-accent">AI Search</span>
                </Button>
              )}
            {aiSearching && (
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching…
              </div>
            )}
          </div>

          {allSuggestions.length > 0 && (
            <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card shadow-sm">
              {allSuggestions.map((it, idx) => (
                <button
                  key={`${it.code}-${idx}`}
                  onClick={() => addItem(it, 100)}
                  className="flex w-full min-w-0 items-center justify-between border-b border-border px-3 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                    <span className="truncate font-medium">{it.name}</span>
                    {it.code === "ai-fallback" && (
                      <Badge className="h-4 shrink-0 border-none bg-accent/20 px-1 text-[9px] font-bold uppercase text-accent">
                        AI
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {kcal(it.enerc).toFixed(0)} kcal/100g
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Ingredients ── */}
        {items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border/60 bg-muted/5 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <ChefHat className="h-6 w-6 text-accent opacity-80" />
            </div>
            <h3 className="mb-1 font-display font-bold">No ingredients yet</h3>
            <p className="mx-auto max-w-[240px] text-sm text-muted-foreground">
              Search above to add foods — quantities and macros stay fully
              editable.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Ingredients ({items.length})
            </Label>
            <div className="divide-y overflow-hidden rounded-2xl border border-border">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between bg-card px-3 py-3 transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="min-w-0 flex-1 truncate pr-2 text-sm font-bold">
                        {item.name}
                      </p>
                      <div className="flex shrink-0 items-center gap-1 rounded-md border border-accent/20 bg-accent/10 px-2 py-1">
                        <Input
                          type="number"
                          value={item.quantity_g}
                          onChange={(e) => updateQuantity(i, e.target.value)}
                          className="h-5 w-14 border-none bg-transparent px-0 py-0 text-center text-xs font-bold shadow-none focus-visible:ring-0"
                        />
                        <span className="text-[10px] font-bold uppercase text-accent">
                          g
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border/50 bg-muted/30 p-2 text-center sm:grid-cols-5">
                      {(
                        [
                          ["Cal", "calories"],
                          ["Pro", "protein_g"],
                          ["Carb", "carbs_g"],
                          ["Fat", "fat_g"],
                          ["Fib", "fiber_g"],
                        ] as const
                      ).map(([label, key]) => (
                        <div key={key} className="flex flex-col items-center">
                          <span className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">
                            {label}
                          </span>
                          <Input
                            type="number"
                            value={Math.round(item[key])}
                            onChange={(e) => updateMacro(i, key, e.target.value)}
                            className="h-7 w-full bg-background px-0 text-center text-[11px] font-semibold"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1 h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setItems(items.filter((_, j) => j !== i))
                    }
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── History ── */}
        {historyItems.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              From your previous meals
            </Label>
            <div className="divide-y overflow-hidden rounded-2xl border border-border bg-card">
              {historyItems.map((item, idx) => (
                <button
                  key={`hist-${idx}`}
                  onClick={() => addItem(item, 100)}
                  className="flex w-full min-w-0 items-center justify-between px-3 py-3 text-left text-sm transition-colors hover:bg-muted"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                    <History className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{item.name}</span>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Sticky totals + save bar ── */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl">
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] font-bold">
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                {Math.round(totals.calories)} kcal
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                P{Math.round(totals.protein_g)}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                C{Math.round(totals.carbs_g)}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                F{Math.round(totals.fat_g)}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                Fib{Math.round(totals.fiber_g)}
              </span>
            </div>
          </div>
          <Button
            onClick={save}
            disabled={saving}
            className="h-12 w-full gap-2 rounded-xl bg-accent text-base font-bold text-accent-foreground hover:bg-accent/90"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Heart className="h-5 w-5" />
            )}
            Save to Favourites
          </Button>
        </div>
      </div>
    </div>
  );
}
