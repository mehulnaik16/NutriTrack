import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { WorkoutGate } from "@/components/WorkoutGate";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, PencilRuler, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomPlanTable } from "@/components/CustomPlanTable";
import { CustomPlanDayPicker } from "@/components/CustomPlanDayPicker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";
import {
  type CustomPlan,
  type StandardMuscle,
  STANDARD_MUSCLE_GROUPS,
  MAX_MUSCLES_PER_DAY,
  isCustomPlan,
  cycleDayIndex,
  updatePlanDay,
  activeMuscles,
} from "@/lib/musclePlan";
import { MuscleIcon } from "@/components/MuscleIcon";

export const Route = createFileRoute("/custom-plan-edit")({
  component: GatedCustomPlanEditor,
});

/** Gated: reachable directly from the dashboard, so it needs the same lock. */
function GatedCustomPlanEditor() {
  return (
    <WorkoutGate>
      <CustomPlanEditor />
    </WorkoutGate>
  );
}

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

  // Inline day editor state
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [editSelections, setEditSelections] = useState<StandardMuscle[]>([]);
  const [saving, setSaving] = useState(false);

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
      .update({ plan_json: updated as any })
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlan(updated);
    toast.success(`Day ${dayIdx + 1} updated`);
  };

  const openDayEditor = (dayIdx: number) => {
    if (!plan) return;
    const day = plan.days[dayIdx];
    const current = activeMuscles(day) as StandardMuscle[];
    setEditSelections(current);
    setEditingDayIdx(dayIdx);
  };

  const toggleMuscle = (m: StandardMuscle) => {
    setEditSelections((prev) => {
      if (m === "Rest Day") {
        return prev.includes("Rest Day") ? [] : ["Rest Day"];
      }
      const withoutRest = prev.filter((x) => x !== "Rest Day");
      if (withoutRest.includes(m)) return withoutRest.filter((x) => x !== m);
      if (withoutRest.length >= MAX_MUSCLES_PER_DAY) {
        toast.info(`Max ${MAX_MUSCLES_PER_DAY} muscle groups per day`);
        return withoutRest;
      }
      return [...withoutRest, m];
    });
  };

  const confirmEdit = async () => {
    if (editingDayIdx === null) return;
    setSaving(true);
    await saveDay(editingDayIdx, editSelections);
    setSaving(false);
    setEditingDayIdx(null);
  };

  /**
   * Re-phase the cycle to the picked day, anchored to today. Same write the
   * Workout page's picker performs; the row is updated, never replaced.
   */
  const confirmDay = async (i: number) => {
    if (!planId) return false;
    const { error } = await supabase
      .from("workout_plans")
      .update({
        custom_plan_day_idx: i,
        custom_plan_day_anchor: todayLocal(),
      } as any)
      .eq("id", planId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    // Anchored to today, so the picked day *is* today — no cycle math needed.
    setTodayIdx(i);
    toast.success("Day updated");
    return true;
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
              onEditDay={openDayEditor}
            />

            {/* ── Inline day muscle editor ── */}
            {editingDayIdx !== null && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 mt-4 rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-display text-sm font-bold">
                    {plan.days[editingDayIdx].day} — pick muscles
                  </p>
                  <button
                    onClick={() => setEditingDayIdx(null)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {STANDARD_MUSCLE_GROUPS.map((m) => {
                    const selected = editSelections.includes(m);
                    const isRestSelected = editSelections.includes("Rest Day");
                    const isRestOption = m === "Rest Day";
                    const dimmed = isRestSelected && !isRestOption;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMuscle(m)}
                        className={`relative flex items-center gap-2 rounded-2xl border-2 p-3 text-left text-sm transition-all duration-200 ${
                          selected
                            ? "border-accent bg-accent/10 glow-accent-sm"
                            : dimmed
                              ? "border-border bg-card opacity-40"
                              : "border-border bg-card hover:border-muted-foreground/40"
                        } ${isRestOption ? "col-span-2" : ""}`}
                      >
                        <MuscleIcon muscle={m} className="h-6 w-6" />
                        <span className={`min-w-0 flex-1 truncate font-semibold ${selected ? "text-accent" : ""}`}>
                          {m}
                        </span>
                        {selected && isRestOption && (
                          <Check className="h-4 w-4 shrink-0 text-accent" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditingDayIdx(null)}
                    disabled={saving}
                    className="flex-1 rounded-full font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmEdit}
                    disabled={saving}
                    className="flex-1 rounded-full bg-accent font-bold text-accent-foreground hover:bg-accent/90"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save {plan.days[editingDayIdx].day}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <h2 className="font-display text-base font-bold tracking-tight">
                  Change today's day
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Missed a session, or started the week somewhere else? Tap the
                  day you're actually doing today, then hit Confirm. The plan
                  carries on from there — Day 1 doesn't have to be Monday.
                </p>
              </div>
              <CustomPlanDayPicker
                days={plan.days}
                todayIdx={todayIdx}
                onConfirm={confirmDay}
              />
            </div>
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
