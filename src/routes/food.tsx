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
} from "lucide-react";
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

function FoodPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const searchRef = useRef<FoodSearchRef>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: p }, { data: t }] = await Promise.all([
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
    ]);
    setProfile(p);
    setTodayLogs(t ?? []);
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
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <Card className="border-accent/10 shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Utensils className="h-5 w-5 text-accent" /> Log Food
              </CardTitle>
              <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-md">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-bold min-w-[70px] text-center uppercase tracking-wider">
                  {selectedDate === today() ? "Today" : selectedDate.slice(5)}
                </span>
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
            <FoodSearch ref={searchRef} userId={user.id} date={selectedDate} onLogged={load} />

            {todayLogs.length > 0 ? (
              <div className="mt-8 space-y-5">
                {meals.map((m) => {
                  const items = todayLogs.filter((l) => l.meal_type === m);
                  if (!items.length) return null;
                  const sub = items.reduce(
                    (a, x) => ({
                      cal: a.cal + x.calories,
                      p: a.p + x.protein_g,
                    }),
                    { cal: 0, p: 0 },
                  );

                  return (
                    <div key={m} className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          {m}
                        </h3>
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {Math.round(sub.cal)} kcal
                        </span>
                      </div>
                      <div className="divide-y rounded-xl border bg-card overflow-hidden">
                        {items.map((l) => (
                          <div
                            key={l.id}
                            className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors"
                          >
                            <div>
                              <div className="text-sm font-semibold">
                                {l.food_name}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {l.quantity_g}g · {Math.round(l.calories)} kcal
                                · {Math.round(l.protein_g)}g protein
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-accent hover:bg-accent/10 font-medium px-2"
                                onClick={() => searchRef.current?.editLog(l)}
                              >
                                Modify
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteLog(l.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 py-12 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-xl bg-muted/10">
                <UtensilsCrossed className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No meals logged yet.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Search or scan above to get started.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
