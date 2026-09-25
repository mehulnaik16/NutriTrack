/**
 * Fast Food Meal: pick a restaurant, then one of its menu items. Known brands
 * list their own catalog rows; anything else goes to the AI on the fast-food
 * prompt (serverFastFoodSearch). The typed text lives in the parent, so it is
 * still there when the log card is cancelled and this dialog comes back.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Pizza, Search, Store } from "lucide-react";
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

export function FastFoodDialog({
  open,
  onOpenChange,
  restaurant,
  onRestaurantChange,
  meal,
  onMealChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurant: string;
  onRestaurantChange: (v: string) => void;
  meal: string;
  onMealChange: (v: string) => void;
  /** A food to open in the log card. */
  onPick: (item: IFCTItem) => void;
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
            {brand
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
                brand ? "e.g. Farmhouse pizza" : "e.g. Chicken burger"
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

        {brand && typedMeal && (
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
      </DialogContent>
    </Dialog>
  );
}
