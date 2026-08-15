import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Dumbbell,
  Star,
  TrendingUp,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EXERCISES_DB } from "@/lib/exercises";

/** Epley formula — estimated one-rep max. */
const estimate1RM = (weight: number, reps: number): number => {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
};

/** exercise name (lowercased) → muscle-group key, built once from EXERCISES_DB. */
const MUSCLE_OF = new Map<string, string>();
for (const [group, names] of Object.entries(EXERCISES_DB)) {
  for (const n of names) if (!MUSCLE_OF.has(n.toLowerCase())) MUSCLE_OF.set(n.toLowerCase(), group);
}

interface Log {
  id: string;
  date: string;
  logged_at: string;
  workout_name: string;
  exercises_done: { weight?: string | number; reps?: string | number; unit?: string }[];
}

const num = (v: unknown) => parseFloat(String(v ?? "")) || 0;

/**
 * `exercises_done` is jsonb and holds three different shapes:
 *   - logged sets   → [{ weight, reps, unit }]   ← the only shape this page renders
 *   - cardio        → { bpm: null }              (an object, not an array)
 *   - plan template → [{ name, sets, reps }]     (exercises, not sets — no weight)
 * Every read goes through here so no caller can trip over the other two.
 */
const setsOf = (l: Log) => {
  const raw = l.exercises_done;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === "object" && "weight" in s);
};

/** Best estimated 1RM across a log's sets. */
const best1RM = (l: Log) =>
  setsOf(l).reduce((b, s) => Math.max(b, estimate1RM(num(s.weight), num(s.reps))), 0);

export function WorkoutLogHistory() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chartFor, setChartFor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("workout_logs")
      .select("id, date, logged_at, workout_name, exercises_done")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("logged_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => {
        // Keep only strength logs — cardio and plan-template rows have no sets to show.
        setLogs(((data || []) as Log[]).filter((l) => setsOf(l).length > 0));
        setLoading(false);
      });
  }, [user]);

  const loggedDates = useMemo(() => [...new Set(logs.map((l) => l.date))], [logs]);
  const activeDate = picked ?? loggedDates[0] ?? null;

  /** The active day's logs bucketed by muscle group — max 3 groups, per spec. */
  const groups = useMemo(() => {
    const day = logs.filter((l) => l.date === activeDate);
    const by = new Map<string, Log[]>();
    for (const l of day) {
      const g = MUSCLE_OF.get(l.workout_name.toLowerCase()) ?? "other";
      by.set(g, [...(by.get(g) ?? []), l]);
    }
    return [...by.entries()].slice(0, 3);
  }, [logs, activeDate]);

  /** Best 1RM for an exercise strictly before this log — anything above it is a PR. */
  const priorBest = (l: Log) =>
    logs
      .filter((x) => x.workout_name === l.workout_name && x.logged_at < l.logged_at)
      .reduce((b, x) => Math.max(b, best1RM(x)), 0);

  const chartData = useMemo(() => {
    if (!chartFor) return [];
    return logs
      .filter((l) => l.workout_name === chartFor)
      .slice()
      .reverse()
      .map((l) => ({
        date: l.date.slice(5),
        maxWeight: setsOf(l).reduce((m, s) => Math.max(m, num(s.weight)), 0),
        e1rm: best1RM(l),
      }));
  }, [chartFor, logs]);

  if (loading) {
    return (
      <div className="flex justify-center p-16">
        <Dumbbell className="h-8 w-8 animate-pulse text-accent opacity-60" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Sub-header: title + calendar trigger (calendar itself stays hidden) ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold tracking-tight">🏋️ Workout Log</h2>
        <button
          onClick={() => setCalOpen(true)}
          aria-label="Open calendar"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent transition-transform active:scale-95"
        >
          <CalendarDays className="h-5 w-5" />
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Dumbbell className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            {loggedDates.length === 0
              ? "Log your first workout to start building your history!"
              : "No workout logged on this day. Time to hit the gym!"}
          </p>
        </div>
      ) : (
        groups.map(([group, items]) => {
          const isOpen = !collapsed[group];
          return (
            <div key={group} className="overflow-hidden rounded-2xl border border-border bg-card">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [group]: isOpen }))}
                className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-black uppercase tracking-widest">
                    {group}
                  </span>
                  <span className="shrink-0 text-xs font-bold uppercase text-muted-foreground">
                    · {items.length} exercise{items.length > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                  {new Date(activeDate + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </button>

              {isOpen &&
                items.map((l, i) => {
                  const open = expanded === l.id;
                  const sets = setsOf(l);
                  const unit = sets[0]?.unit ?? "kg";
                  const volume = sets.reduce((v, s) => v + num(s.weight) * num(s.reps), 0);
                  const prThreshold = priorBest(l);
                  const top = best1RM(l);
                  return (
                    <div key={l.id} className="border-t border-border/60">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <span className="w-4 shrink-0 font-display text-sm font-bold text-muted-foreground">
                          {i + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold">{l.workout_name}</p>
                          <p className="text-xs text-muted-foreground">Last Logged: {l.date}</p>
                        </div>
                        <button
                          onClick={() => setExpanded(open ? null : l.id)}
                          aria-label={open ? "Collapse sets" : "Expand sets"}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                            open
                              ? "border-accent bg-accent/10 text-accent glow-accent-sm"
                              : "border-border bg-muted/50 text-muted-foreground"
                          }`}
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                        <button
                          onClick={() => setChartFor(l.workout_name)}
                          aria-label="View progress chart"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-transform active:scale-95"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </button>
                      </div>

                      {open && (
                        <div className="mx-4 mb-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                          <p className="mb-2 text-sm font-semibold">Last Logged: {l.date}</p>
                          <div className="space-y-1.5 border-t border-border/60 pt-2">
                            {sets.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No logged data for this exercise yet.
                              </p>
                            )}
                            {sets.map((s, si) => {
                              const rm = estimate1RM(num(s.weight), num(s.reps));
                              const isPR = rm > 0 && rm === top && rm > prThreshold;
                              return (
                                <div
                                  key={si}
                                  className="flex items-center gap-3 text-sm tabular-nums"
                                >
                                  <span className="w-12 text-muted-foreground">Set {si + 1}</span>
                                  <span className="w-20 text-right font-bold">
                                    {num(s.weight)}
                                    {unit}
                                  </span>
                                  <span className="text-muted-foreground">×</span>
                                  <span className="flex-1 font-bold">{num(s.reps)} reps</span>
                                  {isPR && (
                                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black text-amber-400">
                                      <Star className="h-3 w-3 fill-current" /> PR!
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border/60 pt-2 text-xs font-semibold tabular-nums">
                            <span className="flex items-center gap-1.5">
                              <BarChart3 className="h-3.5 w-3.5 text-accent" />
                              Total Volume:{" "}
                              <span className="text-accent">
                                {volume.toLocaleString()}
                                {unit}
                              </span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5" />
                              Est. 1RM:{" "}
                              <span className="font-bold">
                                {top}
                                {unit}
                              </span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })
      )}

      {/* ── Calendar overlay — only mounted when the button is tapped ── */}
      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pick a date</DialogTitle>
            <DialogDescription className="sr-only">
              Pick a date to view that day's workout log
            </DialogDescription>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={activeDate ? new Date(activeDate + "T00:00:00") : undefined}
            onSelect={(d) => {
              if (!d) return;
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              setPicked(iso);
              setExpanded(null);
              setCalOpen(false);
            }}
            modifiers={{ logged: loggedDates.map((d) => new Date(d + "T00:00:00")) }}
            modifiersClassNames={{
              logged:
                "relative after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-accent",
            }}
            className="mx-auto"
          />
          <button
            onClick={() => {
              setPicked(null);
              setCalOpen(false);
            }}
            className="rounded-xl bg-muted py-2.5 text-xs font-bold uppercase tracking-widest"
          >
            Today
          </button>
        </DialogContent>
      </Dialog>

      {/* ── Per-exercise progress chart ── */}
      <Dialog open={!!chartFor} onOpenChange={() => setChartFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-accent">{chartFor}</DialogTitle>
            <DialogDescription className="sr-only">
              Weight and estimated one-rep max progress over time for {chartFor}
            </DialogDescription>
          </DialogHeader>
          {chartData.length < 2 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Log this exercise at least twice to see progress.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="maxWeight"
                  name="Max Weight"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  name="Est. 1RM"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
