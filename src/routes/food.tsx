import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { FoodSearch, FoodSearchRef } from "@/components/FoodSearch";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import {
  Utensils,
  UtensilsCrossed,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ChevronDown,
  Heart,
  RotateCcw,
  Flame,
  PenTool,
  Plus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/food")({ component: FoodPage });

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${date}`;
};

const shiftDate = (iso: string, days: number) => {
  const [y, m, date] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, date + days);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const parseLocalDate = (iso: string) => {
  const [y, m, date] = iso.split("-").map(Number);
  return new Date(y, m - 1, date);
};

const formatDateDisplay = (dateStr: string) => {
  if (dateStr === today()) return "Today";
  if (dateStr === shiftDate(today(), -1)) return "Yesterday";

  const d = parseLocalDate(dateStr);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

function FoodPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const searchRef = useRef<FoodSearchRef>(null);
  const [favoriteNames, setFavoriteNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const handleDateSelect = (d: Date | undefined) => {
    if (d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      setSelectedDate(`${y}-${m}-${date}`);
      setIsCalendarOpen(false);
    }
  };

  const handleQuickAction = (dateStr: string) => {
    setSelectedDate(dateStr);
    setIsCalendarOpen(false);
  };

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: t }, { data: fav }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("food_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", selectedDate)
        .order("logged_at"),
      supabase
        .from("saved_meals" as any)
        .select("name")
        .eq("user_id", user.id),
    ]);
    setProfile(p);
    setTodayLogs(t ?? []);
    if (fav) setFavoriteNames(new Set(fav.map((f: any) => f.name)));
  }, [user, selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteLog = async (id: string) => {
    const { error } = await supabase.from("food_logs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed");
    load();
  };

  const relogFood = async (l: any) => {
    if (!user) return;
    const { error } = await supabase.from("food_logs").insert({
      user_id: user.id,
      date: selectedDate,
      meal_type: l.meal_type,
      food_name: l.food_name,
      quantity_g: l.quantity_g,
      calories: l.calories,
      protein_g: l.protein_g,
      carbs_g: l.carbs_g,
      fat_g: l.fat_g,
      fiber_g: l.fiber_g || 0,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${l.food_name} logged again!`);
    load();
  };

  const saveFoodAsFavorite = async (l: any) => {
    if (!user) return;
    const isFav = favoriteNames.has(l.food_name);

    if (isFav) {
      // Remove from favorites
      const { error } = await supabase
        .from("saved_meals" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("name", l.food_name);
      if (!error) {
        setFavoriteNames((prev) => {
          const s = new Set(prev);
          s.delete(l.food_name);
          return s;
        });
        toast.success(`Removed from Favorites`);
        searchRef.current?.refreshFavorites();
      }
    } else {
      // Add to favorites
      const { error } = await supabase.from("saved_meals" as any).insert({
        user_id: user.id,
        name: l.food_name,
        calories: l.calories,
        protein_g: l.protein_g,
        carbs_g: l.carbs_g,
        fat_g: l.fat_g,
        fiber_g: l.fiber_g || 0,
      });
      if (!error) {
        setFavoriteNames((prev) => new Set(prev).add(l.food_name));
        toast.success(`${l.food_name} saved to Favorites!`);
        searchRef.current?.refreshFavorites();
      } else {
        toast.error(error.message);
      }
    }
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const meals = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
  const firstName = profile.full_name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-muted/10 pb-24">
      <Header name={firstName} />
      <main className="mx-auto max-w-3xl space-y-6 px-3 py-5 sm:px-6 sm:py-6">
        <Card className="border-accent/10 shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Utensils className="h-5 w-5 text-accent" /> Log Food
              </CardTitle>
              <div className="flex w-full items-center justify-between gap-1.5 rounded-md bg-muted/50 p-1 sm:w-auto sm:justify-start">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1"
                    >
                      {formatDateDisplay(selectedDate)}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="center">
                    <div className="flex gap-2 mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleQuickAction(today())}
                      >
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() =>
                          handleQuickAction(shiftDate(today(), -1))
                        }
                      >
                        Yesterday
                      </Button>
                    </div>
                    <Calendar
                      mode="single"
                      selected={parseLocalDate(selectedDate)}
                      onSelect={(d) => handleDateSelect(d)}
                      disabled={(d) => {
                        const todayStart = new Date();
                        todayStart.setHours(0, 0, 0, 0);
                        const dStart = new Date(d);
                        dStart.setHours(0, 0, 0, 0);
                        return dStart > todayStart;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={selectedDate >= today()}
                  onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <FoodSearch
              ref={searchRef}
              userId={user.id}
              date={selectedDate}
              onLogged={load}
            />

            <div className="mt-5 space-y-5">
              {meals.map((m) => {
                const items = todayLogs.filter((l) => l.meal_type === m);
                const sub = items.reduce(
                  (a, x) => ({
                    cal: a.cal + x.calories,
                    p: a.p + x.protein_g,
                    fib: a.fib + (x.fiber_g || 0),
                  }),
                  { cal: 0, p: 0, fib: 0 },
                );

                return (
                  <div key={m} className="space-y-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/15">
                          <Utensils className="h-3 w-3 text-accent" />
                        </div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {m}
                        </h3>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 text-[10px] uppercase font-bold text-accent px-2 ml-1 hover:bg-accent/10"
                          onClick={() => searchRef.current?.openForMeal(m)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                      {items.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                            {Math.round(sub.cal)} kcal
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            P{Math.round(sub.p)}g
                          </span>
                        </div>
                      )}
                    </div>

                    {items.length > 0 ? (
                      <div className="divide-y rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
                        {items.map((l) => {
                          const isFav = favoriteNames.has(l.food_name);
                          return (
                            <div
                              key={l.id}
                              className="p-3 hover:bg-muted/20 transition-colors group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold truncate">
                                    {l.food_name}
                                  </div>
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <span className="text-[10px] font-medium bg-muted/60 px-1.5 py-0.5 rounded">
                                      {Math.round(l.quantity_g)}g
                                    </span>
                                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                                      {Math.round(l.calories)} kcal
                                    </span>
                                    <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                      P{Math.round(l.protein_g)}
                                    </span>
                                    <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                                      C{Math.round(l.carbs_g)}
                                    </span>
                                    <span className="text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                                      F{Math.round(l.fat_g)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 transition-all ${
                                      isFav
                                        ? "text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                        : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                    }`}
                                    title={
                                      isFav
                                        ? "Remove from Favorites"
                                        : "Save to Favorites"
                                    }
                                    onClick={() => saveFoodAsFavorite(l)}
                                  >
                                    <Heart
                                      className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`}
                                    />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-green-500 hover:bg-green-500/10"
                                    title="Log again"
                                    onClick={() => relogFood(l)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-accent hover:bg-accent/10"
                                    title="Modify"
                                    onClick={() =>
                                      searchRef.current?.editLog(l)
                                    }
                                  >
                                    <PenTool className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Delete"
                                    onClick={() => deleteLog(l.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-2 text-center border border-dashed border-border/50 rounded-xl bg-muted/5">
                        <p className="text-xs text-muted-foreground">No food logged yet.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
