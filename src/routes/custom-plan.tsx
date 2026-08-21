import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  PencilRuler,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";
import {
  STANDARD_MUSCLE_GROUPS,
  MUSCLE_EMOJI,
  MAX_MUSCLES_PER_DAY,
  type StandardMuscle,
  buildCustomPlan,
  isCustomPlan,
  activeMuscles,
  tableColumnCount,
} from "@/lib/musclePlan";

export const Route = createFileRoute("/custom-plan")({
  component: CustomPlanBuilder,
});

const TOTAL_DAYS = 7;
const emptyWeek = (): StandardMuscle[][] =>
  Array.from({ length: TOTAL_DAYS }, () => []);

function CustomPlanBuilder() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  const [day, setDay] = useState(1); // 1..7
  const [week, setWeek] = useState<StandardMuscle[][]>(emptyWeek);
  const [saving, setSaving] = useState(false);
  const [existingPlanIds, setExistingPlanIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [startDayIdx, setStartDayIdx] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  // Pre-fill when editing an existing custom plan
  useEffect(() => {
    if (!user) return;
    supabase
      .from("workout_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setExistingPlanIds(data.map((d: any) => d.id));
        const existingIdx = (data[0] as any)?.custom_plan_day_idx;
        if (typeof existingIdx === "number") setStartDayIdx(existingIdx);
        const latest = data[0]?.plan_json as any;
        if (isCustomPlan(latest) && latest.days.length === TOTAL_DAYS) {
          setWeek(
            latest.days.map((d: any) =>
              d.muscles?.includes("Rest Day") ? [] : activeMuscles(d),
            ),
          );
        }
      });
  }, [user]);

  const selections = week[day - 1] ?? [];
  const isRestSelected = selections.includes("Rest Day");

  const toggle = (m: StandardMuscle) => {
    setWeek((prev) => {
      const copy = prev.map((d) => [...d]);
      const cur = copy[day - 1];

      if (m === "Rest Day") {
        // Rest Day is exclusive — clears everything else
        copy[day - 1] = cur.includes("Rest Day") ? [] : ["Rest Day"];
        return copy;
      }

      const withoutRest = cur.filter((x) => x !== "Rest Day");
      if (withoutRest.includes(m)) {
        copy[day - 1] = withoutRest.filter((x) => x !== m);
      } else {
        if (withoutRest.length >= MAX_MUSCLES_PER_DAY) {
          toast.info(`Max ${MAX_MUSCLES_PER_DAY} muscle groups per day`);
          copy[day - 1] = withoutRest;
        } else {
          copy[day - 1] = [...withoutRest, m];
        }
      }
      return copy;
    });
  };

  // ── Live table preview (dynamic columns) ──
  const previewDays = useMemo(
    () =>
      week.map((sel, i) => ({
        day: `Day ${i + 1}`,
        muscles: sel.filter((m) => m !== "Rest Day"),
        isRest: sel.length === 0 || sel.includes("Rest Day"),
        touched: i < day, // only show rows the user has reached
      })),
    [week, day],
  );
  const colCount = tableColumnCount(
    previewDays.map((d) => ({ muscles: d.muscles })),
  );

  const save = async (chosenStartDayIdx: number) => {
    if (!user) return;
    setSaving(true);
    try {
      const plan = buildCustomPlan(week);
      // The picked day is today, so anchor the cycle to today's date — the
      // old code never wrote the anchor, which left cycleDayIndex with a null
      // clock and froze the plan on whichever day was saved.
      const anchor = todayLocal();
      // Update the newest row in place instead of delete-and-reinsert: the
      // row is the plan's identity, and blowing it away took the cycle
      // anchor with it. Only genuine duplicates get deleted.
      const [keepId, ...stale] = existingPlanIds;
      if (stale.length > 0) {
        await supabase.from("workout_plans").delete().in("id", stale);
      }
      const { error } = keepId
        ? await supabase
            .from("workout_plans")
            .update({
              goal: plan.goal, // NOT NULL column
              plan_json: plan,
              custom_plan_day_idx: chosenStartDayIdx,
              custom_plan_day_anchor: anchor,
            } as any)
            .eq("id", keepId)
        : await supabase.from("workout_plans").insert({
            user_id: user.id,
            goal: plan.goal, // NOT NULL column
            plan_json: plan,
            custom_plan_day_idx: chosenStartDayIdx,
            custom_plan_day_anchor: anchor,
          } as any);
      if (error) throw error;
      toast.success("Custom plan saved! 💪");
      navigate({ to: "/workout" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save plan");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-40">
      {/* ── Header + progress ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={saving}
            onClick={() =>
              confirming ? setConfirming(false) : day > 1 ? setDay(day - 1) : router.history.back()
            }
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display text-sm font-bold">
              <PencilRuler className="h-4 w-4 text-accent" /> Custom Workout
              Plan
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {confirming ? "Review & confirm" : `Day ${day} of ${TOTAL_DAYS}`}
            </p>
          </div>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-accent transition-all duration-500 ease-out glow-accent-sm"
            style={{ width: confirming ? "100%" : `${(day / TOTAL_DAYS) * 100}%` }}
          />
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-6">
        {confirming ? (
          <>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Your week
            </h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Here's the plan you just built.
            </p>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">
                      Days
                    </th>
                    {Array.from({ length: colCount }, (_, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        Muscle {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewDays.map((d, i) => (
                    <tr
                      key={d.day}
                      className="border-b border-border/50 transition-colors last:border-b-0"
                    >
                      <td className="px-3 py-2 font-semibold">
                        {d.day}
                      </td>
                      {Array.from({ length: colCount }, (_, c) => (
                        <td key={c} className="px-3 py-2">
                          {d.isRest ? (
                            c === 0 ? (
                              <span className="italic text-muted-foreground">
                                Rest Day
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )
                          ) : d.muscles[c] ? (
                            <span className="font-medium">{d.muscles[c]}</span>
                          ) : (
                            <span className="text-muted-foreground/40">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8">
              <h3 className="font-display text-lg font-bold tracking-tight">
                Which one is today?
              </h3>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Pick whichever day you're actually doing today — this is a
                repeating cycle, not tied to the calendar, so "Day 1" doesn't
                have to mean Monday. You can always change this later from
                the Workout page.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {previewDays.map((d, i) => (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setStartDayIdx(i)}
                    className={`flex items-center justify-between rounded-2xl border-2 p-3.5 text-left transition-all duration-200 ${
                      i === startDayIdx
                        ? "border-accent bg-accent/10 glow-accent-sm"
                        : "border-border bg-card hover:border-muted-foreground/40"
                    }`}
                  >
                    <span className="text-sm font-semibold">{d.day}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.isRest ? "Rest Day" : d.muscles.join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
        <>
        <div
          key={day}
          className="animate-in fade-in slide-in-from-right-4 duration-300"
        >
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Day {day}
          </h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Pick up to {MAX_MUSCLES_PER_DAY} muscle groups — or make it a rest
            day. Leaving it empty also counts as rest.
          </p>

          {/* ── The 9 standardized options ── */}
          <div className="grid grid-cols-2 gap-2.5">
            {STANDARD_MUSCLE_GROUPS.map((m) => {
              const selectedIdx = selections.indexOf(m);
              const selected = selectedIdx !== -1;
              const isRestOption = m === "Rest Day";
              const dimmed = isRestSelected && !isRestOption;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle(m)}
                  className={`relative flex items-center gap-2 rounded-2xl border-2 p-3.5 text-left transition-all duration-200 ${
                    selected
                      ? "border-accent bg-accent/10 glow-accent-sm"
                      : dimmed
                        ? "border-border bg-card opacity-40"
                        : "border-border bg-card hover:border-muted-foreground/40"
                  } ${isRestOption ? "col-span-2" : ""}`}
                >
                  <span className="text-lg">{MUSCLE_EMOJI[m]}</span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                      selected ? "text-accent" : ""
                    }`}
                  >
                    {m}
                  </span>
                  {selected && !isRestOption && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent font-display text-[10px] font-bold text-accent-foreground">
                      {selectedIdx + 1}
                    </span>
                  )}
                  {selected && isRestOption && (
                    <Check className="h-4 w-4 shrink-0 text-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Live plan preview (dynamic columns) ── */}
        <div className="mt-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Your week so far
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">
                    Days
                  </th>
                  {Array.from({ length: colCount }, (_, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Muscle {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewDays.map((d, i) => (
                  <tr
                    key={d.day}
                    className={`border-b border-border/50 transition-colors last:border-b-0 ${
                      i === day - 1 ? "bg-accent/10" : ""
                    }`}
                  >
                    <td
                      className={`px-3 py-2 font-semibold ${
                        i === day - 1 ? "text-accent" : ""
                      }`}
                    >
                      {d.day}
                    </td>
                    {Array.from({ length: colCount }, (_, c) => (
                      <td key={c} className="px-3 py-2">
                        {!d.touched && i >= day ? (
                          <span className="text-muted-foreground/40">·</span>
                        ) : d.isRest ? (
                          c === 0 ? (
                            <span className="italic text-muted-foreground">
                              Rest Day
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">-</span>
                          )
                        ) : d.muscles[c] ? (
                          <span className="font-medium">{d.muscles[c]}</span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </main>

      {/* ── Sticky footer ── */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-xl">
        <div className="mx-auto max-w-md px-4 py-3">
          {confirming ? (
            <Button
              onClick={() => save(startDayIdx)}
              disabled={saving}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground glow-accent hover:bg-accent/90"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" /> Save my plan
                </>
              )}
            </Button>
          ) : day < TOTAL_DAYS ? (
            <Button
              onClick={() => setDay(day + 1)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              {selections.length === 0 ? "Rest day — next" : "Continue"}
              <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              className="h-13 w-full gap-2 rounded-full bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-accent/90"
            >
              Review my week
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
