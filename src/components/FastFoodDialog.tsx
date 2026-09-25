/**
 * Fast Food Meal: pick a restaurant, then one of its menu items. Known brands
 * list their own catalog rows; anything else goes to the AI on the fast-food
 * prompt (serverFastFoodSearch). The typed text lives in the parent, so it is
 * still there when the log card is cancelled and this dialog comes back.
 *
 * Build-your-own brands (California Burrito) get the meal builder instead of a
 * menu list: pick a meal, then its ingredients. The build is held here, not in
 * the builder, so a cancelled log card comes back to it; saved builds
 * ("usuals") are Favourites rows and reopen the builder on the same picks.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Loader2,
  Pizza,
  Search,
  Star,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serverFastFoodSearch } from "@/lib/ai";
import { toastAiError } from "@/lib/aiErrors";
import { recordSearchOutcome, searchAttempt } from "@/lib/searchAttempt";
import { useWaitLabel } from "@/hooks/useWaitLabel";
import { kcalOf, type IFCTItem } from "@/lib/foodDb";
import {
  brandHints as hintsFor,
  exactBrand,
  loadRestaurants,
  menuMatches,
  type RestaurantDb,
} from "@/lib/restaurantDb";
import {
  buildName,
  initialPicks,
  readUsual,
  remapPicks,
  totals,
  usualIngredients,
  type Picks,
  type Usual,
} from "@/lib/mealBuilder";
import type { MealIngredient } from "@/lib/meals";
import { supabase } from "@/integrations/client";
import { MealBuilder } from "@/components/MealBuilder";
import type { FavoriteMealInput } from "@/components/FoodSearch";

export function FastFoodDialog({
  open,
  onOpenChange,
  restaurant,
  onRestaurantChange,
  meal,
  onMealChange,
  onPick,
  userId,
  onSaveFavorite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurant: string;
  onRestaurantChange: (v: string) => void;
  meal: string;
  onMealChange: (v: string) => void;
  /** A food to open in the log card. */
  onPick: (item: IFCTItem) => void;
  userId: string;
  /** Saves a build as a Favourites meal (FoodSearch's saver). */
  onSaveFavorite: (meal: FavoriteMealInput) => Promise<boolean>;
}) {
  const [searching, setSearching] = useState(false);
  const wait = useWaitLabel(searching, "Searching the menu…", [
    "Searching the menu…",
    "Checking another AI model…",
    "Still working on it…",
    "Almost there…",
  ]);

  // The menus load the first time this opens, not with the app.
  const [db, setDb] = useState<RestaurantDb | null>(null);
  useEffect(() => {
    if (open && !db) void loadRestaurants().then(setDb);
  }, [open, db]);

  const brands = db?.brands ?? [];
  const brand = exactBrand(brands, restaurant);
  const brandHints = useMemo(
    () => hintsFor(brands, restaurant),
    [brands, restaurant],
  );
  // Only after a word or two of the meal is typed, and only that brand's.
  const menu = useMemo(
    () => (brand && db ? menuMatches(db.rows, brand, meal) : []),
    [db, brand, meal],
  );
  const typedMeal = meal.trim().length >= 2;

  // ── Build your own ─────────────────────────────────────────────────────────
  const builder = brand
    ? db?.builders.find((b) => b.brand === brand)
    : undefined;
  const [build, setBuild] = useState<{
    meal: string;
    size: string;
    picks: Picks;
  } | null>(null);
  // Another restaurant (or a logged meal clearing this one) ends the build.
  useEffect(() => setBuild(null), [brand]);
  const bMeal = builder?.meals.find((m) => m.key === build?.meal);
  const bSize = bMeal?.sizes.find((s) => s.key === build?.size);
  const builderMeals = builder?.meals.filter(
    (m) =>
      !typedMeal || m.name.toLowerCase().includes(meal.trim().toLowerCase()),
  );

  const [usuals, setUsuals] = useState<
    (Usual & { id: string; name: string })[]
  >([]);
  const loadUsuals = () => {
    if (!builder) return;
    void supabase
      .from("saved_meals")
      .select("id, name, ingredients")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) =>
        setUsuals(
          (data ?? []).flatMap((row) => {
            const u = readUsual(
              builder,
              row.ingredients as MealIngredient[] | null,
            );
            return u ? [{ ...u, id: row.id, name: row.name }] : [];
          }),
        ),
      );
  };
  useEffect(() => {
    if (open && builder) loadUsuals();
    else setUsuals([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, builder, userId]);

  const saveUsual = async () => {
    if (!builder || !bMeal || !bSize || !build) return false;
    const t = totals(bSize, build.picks);
    const ok = await onSaveFavorite({
      name: buildName(builder, bMeal, bSize, build.picks),
      calories: +t.kcal.toFixed(1),
      protein_g: +t.protein.toFixed(1),
      carbs_g: +t.carbs.toFixed(1),
      fat_g: +t.fat.toFixed(1),
      fiber_g: 0,
      ingredients: usualIngredients(builder, bMeal, bSize, build.picks),
    });
    if (ok) loadUsuals();
    return ok;
  };

  const canSearch =
    restaurant.trim().length >= 2 && meal.trim().length >= 2 && !searching;

  const aiSearch = async () => {
    if (!canSearch) return;
    setSearching(true);
    try {
      const { items } = await serverFastFoodSearch({
        data: {
          restaurant: (brand ?? restaurant).trim(),
          meal: meal.trim(),
          attempt: searchAttempt(),
        },
      });
      recordSearchOutcome(true);
      const food = items[0] as IFCTItem | undefined;
      if (!food) {
        toast.warning(
          `We couldn't find "${meal.trim()}" at ${brand ?? restaurant.trim()}`,
          { description: "Check the spelling or try the name on the menu." },
        );
        return;
      }
      onPick(food);
    } catch (e) {
      recordSearchOutcome(false);
      toastAiError(e, "fast food search");
    } finally {
      setSearching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !searching && onOpenChange(o)}>
      <DialogContent className="w-[95vw] rounded-2xl p-4 sm:max-w-md sm:p-6 max-h-[90vh] overflow-y-auto">
        {builder && bMeal && bSize && build ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>
                Build your {bMeal.name} at {builder.brand}
              </DialogTitle>
              <DialogDescription>
                Pick each ingredient; the calories add up as you go.
              </DialogDescription>
            </DialogHeader>
            <MealBuilder
              builder={builder}
              meal={bMeal}
              size={bSize}
              picks={build.picks}
              onSize={(key) => {
                const size = bMeal.sizes.find((s) => s.key === key)!;
                setBuild({
                  ...build,
                  size: key,
                  picks: remapPicks(size, build.picks),
                });
              }}
              onPicks={(picks) => setBuild({ ...build, picks })}
              onBack={() => setBuild(null)}
              onLog={onPick}
              onSaveUsual={saveUsual}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pizza className="h-4 w-4 text-accent" /> Fast Food Meal
              </DialogTitle>
              <DialogDescription>
                Log a meal from a restaurant or fast food chain.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="ff-restaurant">Restaurant</Label>
              <div className="relative">
                <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ff-restaurant"
                  value={restaurant}
                  onChange={(e) => onRestaurantChange(e.target.value)}
                  placeholder="e.g. Domino's, KFC, Burger King"
                  autoComplete="off"
                  disabled={searching}
                  className="pl-9"
                />
              </div>
              {brandHints.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {brandHints.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        onRestaurantChange(b);
                        // Next is the meal: put the cursor there.
                        setTimeout(
                          () => document.getElementById("ff-meal")?.focus(),
                          0,
                        );
                      }}
                      className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium hover:border-accent hover:bg-accent/10"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {builder
                  ? "Pick what went into your meal and we'll add it up, or type any other meal and tap search."
                  : brand
                    ? `Type the meal to see the matching ${brand} items, or tap search for anything else.`
                    : "Don't see your restaurant? Type its full name, then the meal, and tap search. We'll look it up for you."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-meal">Meal name</Label>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void aiSearch();
                }}
              >
                <Input
                  id="ff-meal"
                  value={meal}
                  onChange={(e) => onMealChange(e.target.value)}
                  placeholder={
                    builder
                      ? "e.g. Churros"
                      : brand
                        ? "e.g. Farmhouse pizza"
                        : "e.g. Chicken burger"
                  }
                  autoComplete="off"
                  disabled={searching || restaurant.trim().length < 2}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Search with AI"
                  title="Search with AI"
                  disabled={!canSearch}
                  className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </form>
              {searching && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {wait.label}
                </p>
              )}
            </div>

            {builder && builderMeals && (
              <div className="space-y-3">
                {usuals.length > 0 && !typedMeal && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Your usuals</p>
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {usuals.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() =>
                            setBuild({
                              meal: u.meal.key,
                              size: u.size.key,
                              picks: u.picks,
                            })
                          }
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm first:rounded-t-lg last:rounded-b-lg hover:bg-accent/10"
                        >
                          <Star className="h-4 w-4 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {u.meal.name}
                              {u.size.label ? ` (${u.size.label})` : ""}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {u.name.split(": ").slice(1).join(": ")}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {Math.round(totals(u.size, u.picks).kcal)} kcal
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Build your meal</p>
                  {builderMeals.length === 0 ? (
                    <p className="rounded-lg border border-border px-2 py-3 text-center text-xs text-muted-foreground">
                      No {meal.trim()} to build here. Tap search to look it up.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {builderMeals.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          disabled={searching}
                          onClick={() =>
                            setBuild({
                              meal: m.key,
                              size: m.sizes[0].key,
                              picks: initialPicks(m.sizes[0]),
                            })
                          }
                          className="group flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-left hover:border-accent hover:bg-accent/10"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {m.name}
                            </span>
                            <span className="block text-[11px] leading-snug text-muted-foreground">
                              {m.sizes.length > 1
                                ? m.sizes.map((s) => s.label).join(", ")
                                : "One size"}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {brand && typedMeal && !builder && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {menu.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    Not on our {brand} list. Tap search to look it up.
                  </p>
                ) : (
                  menu.map((it) => (
                    <button
                      key={it.code}
                      type="button"
                      disabled={searching}
                      onClick={() => onPick(it)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/10"
                    >
                      <span className="min-w-0">
                        <span className="block">
                          {it.name.replace(`${brand} `, "")}
                        </span>
                        {/* What the calories are for: "1 burger = 168 g". */}
                        {it.serving_label && (
                          <span className="block text-xs text-muted-foreground">
                            {it.serving_label}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {/* Some brands' rows have no serving weight: say per 100 g. */}
                        {it.serving_g
                          ? `${Math.round((kcalOf(it) * it.serving_g) / 100)} kcal`
                          : `${Math.round(kcalOf(it))} kcal / 100 g`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
