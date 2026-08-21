import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, PencilRuler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomPlanTable } from "@/components/CustomPlanTable";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";
import {
  type CustomPlan,
  type StandardMuscle,
  isCustomPlan,
  cycleDayIndex,
  updatePlanDay,
} from "@/lib/musclePlan";

export const Route = createFileRoute("/custom-plan-edit")({
  component: CustomPlanEditor,
});

/**
 * Edit an existing custom plan one day at a time.
 *
 * Deliberately NOT the /custom-plan wizard: that builds a plan from scratch
 * and rewrites all 7 days. This patches a single day's `plan_json` in place,
 * so the plan row — and with it the cycle index and anchor — survives.
 */
function CustomPlanEditor() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  const [plan, setPlan] = useState<CustomPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [todayIdx, setTodayIdx] = useState(0);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("workout_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setFetching(false);
        if (!data || !isCustomPlan(data.plan_json)) return;
        const p = data.plan_json as CustomPlan;
        setPlan(p);
        setPlanId(data.id);
        setTodayIdx(
          cycleDayIndex(
            (data as any).custom_plan_day_idx ?? 0,
            (data as any).custom_plan_day_anchor ?? null,
            todayLocal(),
            p.days.length,
          ),
        );
      });
  }, [user]);

  /** Patch one day in place — never delete/reinsert the row. */
  const saveDay = async (dayIdx: number, muscles: StandardMuscle[]) => {
    if (!plan || !planId) return;
    const updated = updatePlanDay(plan, dayIdx, muscles);
    const { error } = await supabase
      .from("workout_plans")
      .update({ plan_json: updated })
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlan(updated);
    toast.success(`Day ${dayIdx + 1} updated`);
  };

  if (loading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => router.history.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display text-sm font-bold">
              <PencilRuler className="h-4 w-4 text-accent" /> Edit my plan
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {plan
                ? `${plan.days_per_week} training day${plan.days_per_week === 1 ? "" : "s"}/week`
                : "No plan yet"}
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-6">
        {plan ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Tap the pencil on any day to change its muscle groups. Each day
              saves on its own — the rest of your week stays exactly as it is.
            </p>
            <CustomPlanTable
              plan={plan}
              todayIdx={todayIdx}
              onSaveDay={saveDay}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              You don't have a custom plan to edit yet.
            </p>
            <Button
              onClick={() => navigate({ to: "/custom-plan" })}
              className="mt-4 rounded-full bg-accent font-bold text-accent-foreground hover:bg-accent/90"
            >
              Build one
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
