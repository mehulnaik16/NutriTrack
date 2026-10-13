import { useCallback, useEffect, useState } from "react";
import { Droplets, Plus, Minus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";
import { loadWaterPrefs, MAX_WATER_GOAL_ML, saveWaterPrefs } from "@/lib/water";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  userId: string;
}

// Wave tile: two identical periods, so sliding it -50% loops seamlessly.
const WAVE_PATH = "M0 12 Q50 0 100 12 T200 12 T300 12 T400 12 V24 H0Z";

export function WaterStreak({ userId }: Props) {
  const [water, setWater] = useState(0);
  const [loading, setLoading] = useState(false);
  // Bumped on every add to replay the splash animation.
  const [splash, setSplash] = useState(0);

  // ── Settings state (local-first; DB-backed via src/lib/water.ts) ──────────
  const [dailyGoalMl, setDailyGoalMl] = useState(2500);
  const [stepMl, setStepMl] = useState(250);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    loadWaterPrefs(userId, (p) => {
      setDailyGoalMl(p.goalMl);
      setStepMl(p.cupMl);
    });
  }, [userId]);

  // ── Controlled string inputs (allow truly empty while typing) ─────────────
  const [goalInput, setGoalInput] = useState("");
  const [stepInput, setStepInput] = useState("");
  const [goalError, setGoalError] = useState("");
  const [stepError, setStepError] = useState("");

  // Sync string inputs whenever settings dialog opens
  useEffect(() => {
    if (isSettingsOpen) {
      setGoalInput(dailyGoalMl.toString());
      setStepInput(stepMl.toString());
      setGoalError("");
      setStepError("");
    }
  }, [isSettingsOpen, dailyGoalMl, stepMl]);

  // ── Validate on blur ───────────────────────────────────────────────────────
  const handleGoalBlur = () => {
    const val = goalInput.trim();
    if (val === "") {
      setGoalError("Daily goal is required.");
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) {
      setGoalError("Daily goal must be a positive number.");
    } else if (num < 1500) {
      setGoalError("Daily goal must be at least 1500 ml.");
    } else if (num > MAX_WATER_GOAL_ML) {
      setGoalError(`Daily goal can be at most ${MAX_WATER_GOAL_ML} ml.`);
    } else {
      setGoalError("");
    }
  };

  const handleStepBlur = () => {
    const val = stepInput.trim();
    if (val === "") {
      setStepError("Cup size is required.");
      return;
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) {
      setStepError("Cup size must be a positive number.");
    } else if (num < 25) {
      setStepError("Cup size must be at least 25 ml.");
    } else {
      setStepError("");
    }
  };

  // ── Save settings with full validation ────────────────────────────────────
  const handleSaveSettings = async () => {
    // Re-run full validation before saving
    const goalVal = goalInput.trim();
    const stepVal = stepInput.trim();

    let hasError = false;

    if (goalVal === "") {
      setGoalError("Daily goal is required.");
      hasError = true;
    } else {
      const gNum = Number(goalVal);
      if (!Number.isFinite(gNum) || gNum <= 0) {
        setGoalError("Daily goal must be a positive number.");
        hasError = true;
      } else if (gNum < 1500) {
        setGoalError("Daily goal must be at least 1500 ml.");
        hasError = true;
      } else if (gNum > MAX_WATER_GOAL_ML) {
        setGoalError(`Daily goal can be at most ${MAX_WATER_GOAL_ML} ml.`);
        hasError = true;
      } else {
        setGoalError("");
      }
    }

    if (stepVal === "") {
      setStepError("Cup size is required.");
      hasError = true;
    } else {
      const sNum = Number(stepVal);
      if (!Number.isFinite(sNum) || sNum <= 0) {
        setStepError("Cup size must be a positive number.");
        hasError = true;
      } else if (sNum < 25) {
        setStepError("Cup size must be at least 25 ml.");
        hasError = true;
      } else {
        setStepError("");
      }
    }

    if (hasError) return;

    // Sanitize and save
    const newGoal = Math.floor(Number(goalVal));
    const newStep = Math.floor(Number(stepVal));

    setDailyGoalMl(newGoal);
    setStepMl(newStep);
    try {
      await saveWaterPrefs(userId, { goalMl: newGoal, cupMl: newStep });
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to save water preferences");
      return;
    }
    setIsSettingsOpen(false);
    toast.success("Water preferences saved");
  };

  // ── Load today's water intake ──────────────────────────────────────────────
  const today = todayLocal();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("water_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    setWater(data?.amount_ml ?? 0);
  }, [userId, today]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Add / remove water ─────────────────────────────────────────────────────
  const update = async (delta: number) => {
    const next = Math.max(0, Math.min(dailyGoalMl + 500, water + delta));
    setLoading(true);
    const { error } = await supabase
      .from("water_logs")
      .upsert(
        { user_id: userId, date: today, amount_ml: next },
        { onConflict: "user_id,date" },
      );
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWater(next);
    if (delta > 0) setSplash((n) => n + 1);
    if (delta > 0 && next >= dailyGoalMl && water < dailyGoalMl) {
      toast.success("💧 Daily water goal hit! Great work.");
    }
  };

  const pct =
    dailyGoalMl > 0
      ? Math.min(100, Math.round((water / dailyGoalMl) * 100))
      : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-1">
      {/* Water card */}
      <Card className="relative min-h-[230px] overflow-hidden">
        {/* Water: fills to today's %, waves drift, splash replays on each add. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{ height: `${Math.max(pct, 6)}%` }}
        >
          <div
            key={splash}
            className={`relative h-full ${splash ? "water-splash" : ""}`}
          >
            <svg
              viewBox="0 0 400 24"
              preserveAspectRatio="none"
              className="water-wave-slow absolute -top-4 left-0 h-6 w-[200%] fill-blue-500/40"
            >
              <path d={WAVE_PATH} />
            </svg>
            <svg
              viewBox="0 0 400 24"
              preserveAspectRatio="none"
              className="water-wave absolute -top-3 left-0 h-6 w-[200%] fill-blue-400"
            >
              <path d={WAVE_PATH} />
            </svg>
            <div className="absolute inset-0 top-2 bg-gradient-to-b from-blue-400 to-blue-800" />
            {[
              ["12%", "0s", 10],
              ["30%", "1.4s", 6],
              ["68%", "2.2s", 8],
              ["85%", "0.7s", 5],
            ].map(([left, delay, size]) => (
              <span
                key={left}
                className="water-bubble absolute bottom-2 rounded-full bg-white/25"
                style={{
                  left: left as string,
                  animationDelay: delay as string,
                  width: size as number,
                  height: size as number,
                }}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 flex min-h-[230px] flex-col gap-3 p-5">
          <div className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-blue-500" />
              Water intake
            </div>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Water settings"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Water Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-5 py-4">
                  {/* Daily Goal */}
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="dailyGoal" className="text-right pt-2">
                      Daily Goal (ml)
                    </Label>
                    <div className="col-span-3 space-y-1">
                      <Input
                        id="dailyGoal"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter ml"
                        value={goalInput}
                        onChange={(e) => {
                          // Allow free typing — only digits and optional leading chars
                          const raw = e.target.value;
                          if (raw === "" || /^\d*$/.test(raw)) {
                            setGoalInput(raw);
                            if (goalError) setGoalError(""); // clear error while editing
                          }
                        }}
                        onBlur={handleGoalBlur}
                        aria-invalid={!!goalError}
                        aria-describedby={goalError ? "goalError" : undefined}
                      />
                      {goalError && (
                        <p id="goalError" className="text-xs text-destructive">
                          {goalError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cup Size */}
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="stepMl" className="text-right pt-2">
                      Cup Size (ml)
                    </Label>
                    <div className="col-span-3 space-y-1">
                      <Input
                        id="stepMl"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter ml"
                        value={stepInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || /^\d*$/.test(raw)) {
                            setStepInput(raw);
                            if (stepError) setStepError("");
                          }
                        }}
                        onBlur={handleStepBlur}
                        aria-invalid={!!stepError}
                        aria-describedby={stepError ? "stepError" : undefined}
                      />
                      {stepError && (
                        <p id="stepError" className="text-xs text-destructive">
                          {stepError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveSettings}>Save changes</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-baseline justify-between gap-2 drop-shadow-sm">
            <div className="min-w-0">
              <span className="font-display text-4xl font-bold tracking-tight">
                {water.toLocaleString()}
              </span>
              <span className="ml-1.5 text-sm text-muted-foreground">
                / {dailyGoalMl.toLocaleString()} ml
              </span>
            </div>
            <span className="shrink-0 text-sm font-bold">{pct}%</span>
          </div>

          <div className="mt-auto space-y-2">
            {pct >= 100 && (
              <p className="text-center text-xs font-semibold text-white">
                💧 Goal complete!
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => update(-stepMl)}
                disabled={loading || water === 0}
                className="h-11 w-12 shrink-0 rounded-xl bg-white/15 text-white backdrop-blur hover:bg-white/25 hover:text-white"
                aria-label="Remove water"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => update(stepMl)}
                disabled={loading}
                className="h-11 flex-1 gap-2 rounded-xl bg-white font-bold text-blue-900 hover:bg-white/90"
                aria-label={`Add ${stepMl} ml of water`}
              >
                <Plus className="h-4 w-4" />
                {`${stepMl} ml`}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
